const apiBase = 'https://swapi.dev/api/';
const cacheExpiry = 60 * 60 * 1000; // 1 hora

async function fetchAllPages(endpoint) {
  let results = [];
  let url = `${apiBase}${endpoint}/`;
  while (url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro na API: ${response.status}`);
    const data = await response.json();
    results = results.concat(data.results);
    url = data.next;
  }
  return results;
}

function getCachedData(key) {
  const cached = localStorage.getItem(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < cacheExpiry) {
        return parsed.data;
      }
    } catch (e) {
      console.warn('Cache inválido, removendo', e);
      localStorage.removeItem(key);
    }
  }
  return null;
}

function setCachedData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.warn('Não foi possível salvar cache:', e);
  }
}

// debounce simples
function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Nova função: busca o nome de um recurso pela URL, com cache
async function fetchNameFromUrl(url) {
  if (!url || typeof url !== 'string') return 'Desconhecido';
  
  const cacheKey = `name_${url}`;
  let cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro na API: ${response.status}`);
    const data = await response.json();
    const name = data.name || data.title || 'Desconhecido';
    setCachedData(cacheKey, name);
    return name;
  } catch (e) {
    console.error('Erro ao buscar nome para URL:', url, e);
    return 'Erro ao carregar';
  }
}

async function loadData(endpoint, nameKey) {
  console.log('Iniciando carregamento para', endpoint);
  const listEl = document.getElementById('list');
  const searchEl = document.getElementById('search');

  if (!listEl) {
    console.error('Elemento #list não encontrado');
    return;
  }
  if (!searchEl) {
    console.warn('Elemento #search não encontrado — busca desabilitada');
  }

  let items = getCachedData(endpoint);
  console.log('Dados do cache:', items ? 'Encontrados' : 'Não encontrados');

  if (!items) {
    console.log('Buscando da API...');
    try {
      items = await fetchAllPages(endpoint);
      setCachedData(endpoint, items);
      console.log('Dados salvos no cache');
    } catch (error) {
      console.error('Erro ao buscar da API:', error);
      listEl.innerHTML = '<li class="list-group-item text-danger">Erro ao carregar dados. Veja console.</li>';
      return;
    }
  }

  // formata o texto a ser mostrado na lista (curto)
  function listText(item) {
    const nameOrTitle = (item[nameKey] || item.title || 'Sem nome');
    // exemplo de resumo: para pessoas, mostra birth_year se existir
    if (item.birth_year) return `${nameOrTitle} — nascimento: ${item.birth_year}`;
    if (item.model) return `${nameOrTitle} — modelo: ${item.model}`;
    return nameOrTitle;
  }

    // ícones temáticos para a lista
  function getIconUrl(item) {
    return 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Star_Wars_Logo.svg/30px-Star_Wars_Logo.svg.png'; // Filme
  }

    function renderList(filteredItems) {
    listEl.innerHTML = '';
    if (!filteredItems || filteredItems.length === 0) {
      listEl.innerHTML = '<li class="list-group-item">Nenhum item encontrado.</li>';
      console.log('Lista renderizada com 0 itens');
      return;
    }
    filteredItems.forEach(item => {
      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action';
      const iconUrl = getIconUrl(item);
      // título resumido com ícone
      li.innerHTML = `<img src="${iconUrl}" alt="Ícone" onerror="this.style.display='none'"><div class="fw-bold">${escapeHtml(listText(item))}</div>`;
      // subinfo curta opcional (ex: gender / climate etc)
      const sub = document.createElement('div');
      sub.className = 'small text-muted';
      sub.textContent = (item.gender && item.gender !== 'n/a') ? `Gênero: ${item.gender}` : '';
      li.appendChild(sub);

      li.style.cursor = 'pointer';
      li.addEventListener('click', () => showModal(item, nameKey));
      listEl.appendChild(li);
    });
    console.log('Lista renderizada com', filteredItems.length, 'itens');
  }

  renderList(items);

  if (searchEl) {
    const handleSearch = debounce((e) => {
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        renderList(items);
        return;
      }
      const filtered = items.filter(item => {
        const candidate = (item[nameKey] || item.title || '').toString().toLowerCase();
        return candidate.includes(query);
      });
      renderList(filtered);
    }, 200);

    searchEl.removeEventListener('input', handleSearch); // remove prev listener safe
    searchEl.addEventListener('input', handleSearch);
  }
}

async function showModal(item, nameKey) {
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const title = item[nameKey] || item.title || 'Detalhes';

  modalTitle.textContent = title;

  // cria detalhes com formatação mais amigável
  let details = '<div class="container-fluid">';
  const entries = Object.entries(item);

  for (const [key, value] of entries) {
    // ignore internal urls if you want, aqui exibimos mas formatado
    if (Array.isArray(value)) {
      if (value.length === 0) {
        details += `<p><strong>${escapeHtml(key)}:</strong> Nenhum</p>`;
      } else {
        // Busca os nomes para cada URL na array
        const names = await Promise.all(value.map(fetchNameFromUrl));
        const text = names.join(', ');
        details += `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(text)}</p>`;
      }
    } else if (typeof value === 'string' && value.startsWith('http')) {
      // Para URLs únicas (ex: homeworld), busca o nome e mostra como texto (não link)
      const name = await fetchNameFromUrl(value);
      details += `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(name)}</p>`;
    } else {
      details += `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}</p>`;
    }
  }

  details += '</div>';

  // Melhoria: adicionar poster real do filme baseado no episode_id (para filmes)
  let imageHtml = '';
  if (item.title && item.episode_id) {
    const posterUrls = {
      4: 'https://upload.wikimedia.org/wikipedia/en/8/87/StarWarsMoviePoster1977.jpg', // A New Hope
      5: 'https://upload.wikimedia.org/wikipedia/en/3/3c/SW_-_Empire_Strikes_Back.jpg', // The Empire Strikes Back
      6: 'https://upload.wikimedia.org/wikipedia/en/b/b2/ReturnOfTheJediPoster1983.jpg', // Return of the Jedi
      1: 'https://upload.wikimedia.org/wikipedia/en/4/40/Star_Wars_Phantom_Menace_poster.jpg', // The Phantom Menace
      2: 'https://upload.wikimedia.org/wikipedia/en/3/32/Star_Wars_-_Episode_II_Attack_of_the_Clones_%28movie_poster%29.jpg', // Attack of the Clones
      3: 'https://upload.wikimedia.org/wikipedia/en/9/93/Star_Wars_Episode_III_Revenge_of_the_Sith_poster.jpg', // Revenge of the Sith
    };
    const posterUrl = posterUrls[item.episode_id] || 'https://via.placeholder.com/300x200/000000/f4e87c?text=Poster+N%C3%A3o+Encontrado'; // Fallback
    imageHtml = `<img src="${posterUrl}" class="img-fluid mb-3" alt="Poster do filme ${title}">`;
  } else if (item.name) { // Para personagens, manter placeholder
    imageHtml = '<img src="https://via.placeholder.com/300x200/000000/f4e87c?text=Character" class="img-fluid mb-3" alt="Imagem do personagem">';
  }

  modalBody.innerHTML = imageHtml + details;

  const modal = new bootstrap.Modal(document.getElementById('itemModal'));
  modal.show();
}

// escape simples para evitar injeção de HTML ao inserir strings
function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}