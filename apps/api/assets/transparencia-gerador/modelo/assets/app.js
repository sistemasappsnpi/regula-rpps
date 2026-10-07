/* Portal de Acesso à Informação — código comum a todos os clientes.
   Tudo que é específico de um cliente vem de window.PORTAL_CONFIG (config.json, injetado pelo index.php). */
(function(){
  "use strict";

  var C = window.PORTAL_CONFIG || {};
  function obj(x){ return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
  function merge(a, b){ var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  var API = obj(C.api);
  var TRANSPARENCIA_URLS = ["proxy.php?d=transparencia", "dados/cache_transparencia.json", "dados/transparencia.local.json"];
  var MENU_URLS = ["proxy.php?d=menu", "dados/cache_menu.json", "dados/menu.local.json"];
  var REFRESH_MS = (+API.atualizarMinutos || 5) * 60 * 1000;

  /* ---------- padrões genéricos (o config.json pode completar ou sobrescrever) ---------- */

  // ícone do cadastro da API (Bootstrap Icons / Font Awesome) -> ícone do sprite
  var ICON_MAP = merge({
    "bi bi-info-circle-fill":"i-info","bi bi-chat-dots-fill":"i-message","fa fa-envelope":"i-message",
    "bi bi-file-earmark-text-fill":"i-document","bi bi-file-text-fill":"i-document","fa fa-file-pdf-o":"i-document",
    "bi bi-file-earmark-pdf-fill":"i-document","bi bi-file-earmark-medical-fill":"i-document","bi bi-eye-fill":"i-document",
    "bi bi-book-half":"i-book","bi bi-journal-text":"i-book","bi bi-journal-bookmark-fill":"i-book",
    "bi bi-file-earmark-bar-graph":"i-chart","bi bi-clipboard-data-fill":"i-chart","bi bi-graph-up-arrow":"i-chart",
    "bi bi-graph-down-arrow":"i-chart","bi bi-calculator-fill":"i-chart","bi bi-bar-chart-steps":"i-chart",
    "bi bi-currency-dollar":"i-coins","bi bi-pc-display-horizontal":"i-document","bi bi-bank":"i-landmark",
    "bi bi-archive-fill":"i-folder","bi bi-building-lock":"i-shield","bi bi-shield-lock-fill":"i-lock",
    "bi bi-heart-pulse-fill":"i-shield","bi bi-calendar-week":"i-calendar","bi bi-calendar-check":"i-calendar",
    "bi bi-people-fill":"i-users","bi bi-people":"i-users","fa fa-users":"i-users","bi bi-person-check-fill":"i-users",
    "bi bi-person-hearts":"i-users","bi bi-person-gear":"i-users","bi bi-file-earmark-person":"i-users",
    "bi bi-database-fill-gear":"i-database","bi bi-file-earmark-code-fill":"i-database",
    "bi bi-diagram-3-fill":"i-sitemap","bi bi-map-fill":"i-sitemap","bi bi-briefcase-fill":"i-briefcase",
    "bi bi-hammer":"i-scale","bi bi-unlock-fill":"i-lock","bi bi-question-circle-fill":"i-question",
    "bi bi-award-fill":"i-award","bi bi-mortarboard":"i-graduation","bi bi-telephone":"i-phone"
  }, obj(C.icones));

  // ícone do grupo quando o config não define: adivinha pelo nome
  var GROUP_ICON_GUESS = [
    [/ouvidoria|atendimento|cidadao|sic\b/, "i-message"], [/receita|financ|orcament|contas/, "i-coins"],
    [/despesa|fiscal|lrf|demonstrativ/, "i-chart"], [/licitac|compra/, "i-scale"], [/contrato/, "i-folder"],
    [/obra/, "i-briefcase"], [/pessoal|recursos humanos|servidor|pessoas/, "i-users"], [/diaria|viage/, "i-plane"],
    [/conselho|comite|colegiad/, "i-sitemap"], [/diretoria|gestao administrativa|institucion/, "i-landmark"],
    [/controle|seguranca|auditor/, "i-shield"], [/governanca|legisla|normas/, "i-scale"], [/educacao|capacita/, "i-graduation"],
    [/lgpd|dados pessoais|privacidade/, "i-lock"], [/investiment|previd|rpps/, "i-piggy"], [/convenio|transferenc/, "i-link2"],
    [/planejamento|prestacao/, "i-doc-check"], [/saude/, "i-shield"], [/acessibilidade/, "i-contrast"]
  ];

  var AMPARO_LABELS = merge({
    "Lei Nº 12.527 (Acesso a Informação) - Lei Complementar Nº 131 (Transparência)": "Lei Nº 12.527/2011 – Lei Complementar Nº 131/2009 (Transparência)",
    "Lei Nº 12.527 (Acesso a Informação)": "Lei Nº 12.527/2011 (Acesso à Informação)",
    "Lei complementar Nº 101 (Transparência)": "Lei Complementar Nº 101/2000 (LRF)"
  }, obj(C.amparos));

  var SYNONYMS = merge({
    "lrf": "lei de responsabilidade fiscal",
    "lai": "lei de acesso a informacao",
    "lgpd": "regulamentacao do governo digital lgpd",
    "sic": "e-sic",
    "faq": "perguntas frequentes faq",
    "licitacao": "licitacoes portal de compras",
    "folha": "quadro de pessoal"
  }, obj(C.sinonimos));

  var GLOSSARY = merge({
    "LRF": "Lei de Responsabilidade Fiscal (Lei Complementar nº 101/2000).",
    "LAI": "Lei de Acesso à Informação (Lei nº 12.527/2011).",
    "LGPD": "Lei Geral de Proteção de Dados (Lei nº 13.709/2018)."
  }, obj(C.glossario));

  var PROFILES = Array.isArray(C.perfis) ? C.perfis : [
    { id:"fornecedor", label:"Sou fornecedor/interessado em licitar", icon:"i-briefcase", match:[
      "licitacoes","contratos","convenios","terceirizados","portal de compras"
    ] },
    { id:"fiscalizador", label:"Sou jornalista/pesquisador/fiscalizador", icon:"i-database", match:[
      "dados abertos","atas","prestacao de contas","demonstrativos","relatorio","receitas","despesas","execucao orcamentaria"
    ] },
    { id:"cidadao", label:"Quero falar com o órgão", icon:"i-message", match:[
      "ouvidoria","e-sic","contatos","perguntas frequentes","carta de servicos"
    ] }
  ];

  var ICON_COLORS = {
    "i-shield":{fg:"#0d2b52",bg:"#e4ebf3"}, "i-landmark":{fg:"#0d2b52",bg:"#e4ebf3"}, "i-award":{fg:"#a67d24",bg:"#f6ecd3"},
    "i-star":{fg:"#a67d24",bg:"#f6ecd3"}, "i-coins":{fg:"#b8860b",bg:"#f8efd6"}, "i-piggy":{fg:"#a5407a",bg:"#f5e0ee"},
    "i-sitemap":{fg:"#6a4a9e",bg:"#ece4f7"}, "i-chart":{fg:"#4a3a8f",bg:"#e6e1f5"}, "i-database":{fg:"#7a6a2e",bg:"#efecd8"},
    "i-book":{fg:"#5a3a66",bg:"#ece1ef"}, "i-document":{fg:"#52627a",bg:"#e6eaf0"}, "i-doc-check":{fg:"#2f7a3d",bg:"#e1f0e3"},
    "i-folder":{fg:"#b4552f",bg:"#f7e3d8"}, "i-calendar":{fg:"#c2691e",bg:"#f9e6d3"}, "i-megaphone":{fg:"#c2691e",bg:"#f9e6d3"},
    "i-scale":{fg:"#8a2f4a",bg:"#f3e0e6"}, "i-lock":{fg:"#3a4356",bg:"#e3e5ea"}, "i-users":{fg:"#b4552f",bg:"#f7e3d8"},
    "i-graduation":{fg:"#1f8a5f",bg:"#dcf2e7"}, "i-target":{fg:"#b5342f",bg:"#f7e0de"}, "i-plane":{fg:"#2f6690",bg:"#dfeaf3"},
    "i-info":{fg:"#2f6690",bg:"#dfeaf3"}, "i-message":{fg:"#0f766e",bg:"#dcf0ee"}, "i-link2":{fg:"#0e7c8a",bg:"#dcf1f3"},
    "i-question":{fg:"#0e7c8a",bg:"#dcf1f3"}, "i-external":{fg:"#52627a",bg:"#e6eaf0"}, "i-contrast":{fg:"#3a4356",bg:"#e3e5ea"}
  };

  /* ---------- utilitários ---------- */
  function norm(s){ return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function key(s){ return norm(s).replace(/\s+/g, " ").trim(); }
  // dicionário do config com chave "sem acento / sem caixa": "CONSELHO FISCAL" acha "Conselho Fiscal"
  function lookup(dict){
    var m = {};
    Object.keys(obj(dict)).forEach(function(k){ m[key(k)] = dict[k]; });
    return function(k){ return m[key(k)]; };
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function safeHref(u){ return /^\s*javascript:/i.test(u || "") ? "#" : esc(u || "#"); }
  function stemWord(w){
    if (w.length > 4){
      if (/coes$/.test(w)) return w.slice(0, -4) + "cao";
      if (/soes$/.test(w)) return w.slice(0, -4) + "sao";
      if (/oes$/.test(w)) return w.slice(0, -3) + "ao";
      if (/ais$/.test(w)) return w.slice(0, -3) + "al";
      if (/eis$/.test(w)) return w.slice(0, -3) + "el";
    }
    if (w.length > 5 && /ns$/.test(w)) return w.slice(0, -2) + "m";
    if (w.length > 3 && /s$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function canon(s){
    return norm(s).split(/([^a-z0-9]+)/).map(function(part){
      return /[a-z0-9]/.test(part) ? stemWord(part) : part;
    }).join("");
  }
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function timeNow(){ var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function slugify(s){ return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  var GRUPOS = obj(C.grupos);
  var groupIconOf = lookup(GRUPOS.icones);
  var groupDescOf = lookup(GRUPOS.descricoes);
  var itemDescOf = lookup(C.descricoesItens);
  var HIDDEN_GROUPS = (Array.isArray(GRUPOS.ocultar) ? GRUPOS.ocultar : []).map(key);

  /* Ordem de exibição. A API de dados abertos não tem campo de ordem, então o proxy lê a ordem oficial
     da página de acesso à informação do cliente (proxy.php?d=ordem) e ela é aplicada aos grupos e aos itens.
     O config guarda a última ordem conhecida, usada enquanto essa leitura não chega (ou se estiver desligada). */
  var ORDEM_AUTO = GRUPOS.ordemAutomatica !== false;
  var ORDEM_URLS = ["proxy.php?d=ordem", "dados/cache_ordem.json"];
  var GROUP_ORDER = (Array.isArray(GRUPOS.ordem) ? GRUPOS.ordem : []).map(key);
  var ITEM_ORDER = {};
  function setItemOrder(mapa){
    ITEM_ORDER = {};
    Object.keys(obj(mapa)).forEach(function(g){
      ITEM_ORDER[key(g)] = (mapa[g] || []).map(key);
    });
  }
  setItemOrder(GRUPOS.ordemItens);
  function aplicarOrdemOficial(lista){
    if (!Array.isArray(lista) || !lista.length) return false;
    GROUP_ORDER = lista.map(function(g){ return key(g.nome); });
    var mapa = {};
    lista.forEach(function(g){ mapa[g.nome] = g.itens || []; });
    setItemOrder(mapa);
    return true;
  }

  function groupIcon(g){
    var icon = groupIconOf(g);
    if (icon) return icon;
    var n = norm(g);
    for (var i = 0; i < GROUP_ICON_GUESS.length; i++) if (GROUP_ICON_GUESS[i][0].test(n)) return GROUP_ICON_GUESS[i][1];
    return "i-document";
  }
  function itemIcon(nomeImagem){
    if (/^i-[a-z0-9-]+$/.test(nomeImagem || "") && document.getElementById(nomeImagem)) return nomeImagem;
    return ICON_MAP[nomeImagem] || "i-document";
  }

  var GLOSSARY_KEYS = Object.keys(GLOSSARY);
  var GLOSSARY_RE = GLOSSARY_KEYS.length ? new RegExp("\\b(" + GLOSSARY_KEYS.join("|") + ")\\b", "gi") : null;
  function wrapGlossary(text){
    text = esc(text);
    if (!GLOSSARY_RE) return text;
    return text.replace(GLOSSARY_RE, function(m){
      var def = GLOSSARY[m.toUpperCase()];
      return def ? '<abbr class="gloss" title="' + esc(def) + '">' + m + '</abbr>' : m;
    });
  }

  // Links da API às vezes vêm com o domínio duplicado ("https://x.gov.br/https://outro...") ou barras dobradas,
  // e às vezes vêm relativos ("portalcompras"). Resolve tudo contra o domínio dos links do cliente.
  var LINK_BASE = (API.dominioLinks || API.base || ((API.urlTransparencia || "").match(/^https?:\/\/[^\/?#]+/i) || [""])[0]).replace(/\/+$/, "");
  function fixLink(raw){
    if (!raw) return "#";
    raw = String(raw).trim();
    if (/^(mailto:|tel:|#)/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)){
      var nested = raw.slice(8).search(/https?:\/\//i);
      if (nested !== -1) return raw.slice(8 + nested);
      return raw.replace(/([^:])\/{2,}/g, "$1/");
    }
    if (!LINK_BASE) return raw;
    return (LINK_BASE + "/" + raw).replace(/([^:])\/{2,}/g, "$1/");
  }

  /* ---------- estado ---------- */
  var groupsOrder = [], groupsMap = {}, allItems = [];
  var uiState = { query: "", profile: null, profileCategory: null };
  var dataState = { live: false, lastSync: null };

  /* ---------- transparência: parse + render ---------- */
  // botões acrescentados pelo gerador (sugestões da Atricon / Pró-Gestão que a API do cliente não traz)
  var EXTRAS = (Array.isArray(C.itensExtras) ? C.itensExtras : []).filter(function(it){ return it && it.Grupo && it.Descricao; });

  function parseTransparencia(raw){
    groupsOrder = []; groupsMap = {};
    allItems = (Array.isArray(raw) ? raw : []).concat(EXTRAS).filter(function(item){
      return item && item.Grupo && HIDDEN_GROUPS.indexOf(key(item.Grupo)) === -1;
    });
    allItems.forEach(function(item){
      var g = item.Grupo;
      if (!groupsMap[g]){ groupsMap[g] = []; groupsOrder.push(g); }
      item._icon = itemIcon(item.NomeImagem);
      item._href = fixLink(item.Link);
      item._search = canon(item.Descricao + " " + g + " " + (item.MaisInformacoes || ""));
      groupsMap[g].push(item);
    });
    // grupos da ordem oficial vêm primeiro, na ordem dada; os demais seguem na ordem em que a API mandou
    var apiPos = {};
    groupsOrder.forEach(function(g, i){ apiPos[g] = i; });
    groupsOrder.sort(function(a, b){
      var ia = GROUP_ORDER.indexOf(key(a)); if (ia === -1) ia = GROUP_ORDER.length;
      var ib = GROUP_ORDER.indexOf(key(b)); if (ib === -1) ib = GROUP_ORDER.length;
      return ia - ib || apiPos[a] - apiPos[b];
    });
    // mesma ideia para os itens (os "botões") dentro de cada categoria
    groupsOrder.forEach(function(g){
      var ordem = ITEM_ORDER[key(g)];
      if (!ordem || !ordem.length) return;
      groupsMap[g].forEach(function(item, i){ item._pos = i; });
      groupsMap[g].sort(function(a, b){
        var ia = ordem.indexOf(key(a.Descricao)); if (ia === -1) ia = ordem.length;
        var ib = ordem.indexOf(key(b.Descricao)); if (ib === -1) ib = ordem.length;
        return ia - ib || a._pos - b._pos;
      });
    });
  }

  var sidebarEl = document.getElementById("sidebar");
  var allGroupsEl = document.getElementById("allGroups");
  var resultsViewEl = document.getElementById("resultsView");
  var searchInput = document.getElementById("searchInput");
  var clearBtn = document.getElementById("clearSearch");

  function renderSidebar(){
    sidebarEl.innerHTML = groupsOrder.map(function(g){
      return '<button class="side-item" data-target="grupo-' + slugify(g) + '">' +
        '<svg class="icon" aria-hidden="true"><use href="#' + groupIcon(g) + '"/></svg>' +
        '<span>' + esc(g) + '</span></button>';
    }).join("");
  }
  sidebarEl.addEventListener("click", function(e){
    var btn = e.target.closest(".side-item");
    if (!btn) return;
    uiState.query = "";
    uiState.profile = null;
    searchInput.value = "";
    clearBtn.style.display = "none";
    renderProfileRow(); updateViewMode();
    var target = document.getElementById(btn.getAttribute("data-target"));
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  var titleEl = document.getElementById("contentTitle");
  var basisEl = document.getElementById("contentBasis");
  var subEl = document.getElementById("contentSub");
  var gridEl = document.getElementById("cardGrid");
  var emptyEl = document.getElementById("emptyState");
  var feedbackRowEl = document.getElementById("feedbackRow");
  var FEEDBACK_ON = !(C.recursos && C.recursos.feedback === false);
  var FEEDBACK_URL = "feedback.php";
  function votedKey(group){ return "feedback_voted_" + group; }

  /* cor vinda da própria API (campo "Cor"); ICON_COLORS só entra como reserva se o item não tiver cor */
  function hexToRgb(hex){
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function(c){ return c + c; }).join("");
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(rgb){
    function h(v){ return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }
    return "#" + h(rgb.r) + h(rgb.g) + h(rgb.b);
  }
  function apiColorPair(hex){
    if (!hex || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return null;
    var rgb = hexToRgb(hex);
    var bg = rgbToHex({ r: rgb.r + (255 - rgb.r) * 0.85, g: rgb.g + (255 - rgb.g) * 0.85, b: rgb.b + (255 - rgb.b) * 0.85 });
    return { fg: hex, bg: bg };
  }

  function cardHTML(item, showCat){
    var col = apiColorPair(item.Cor) || ICON_COLORS[item._icon] || { fg:"#0d2b52", bg:"#e4ebf3" };
    var desc = item.MaisInformacoes || itemDescOf(item.Descricao);
    var external = /^https?:\/\//i.test(item._href) && item._href.indexOf(location.host) === -1;
    return '<a class="card" href="' + safeHref(item._href) + '"' + (external && C.recursos && C.recursos.linksNovaAba ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<span class="card-icon" style="--icon-fg:' + col.fg + ';--icon-bg:' + col.bg + '"><svg class="icon" aria-hidden="true"><use href="#' + item._icon + '"/></svg></span>' +
      (showCat ? '<span class="card-cat">' + esc(item.Grupo) + '</span>' : '') +
      '<span class="card-label">' + wrapGlossary(item.Descricao) + '</span>' +
      (desc ? '<span class="card-desc">' + esc(desc) + '</span>' : '') +
      '<span class="card-go"><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></span>' +
      '</a>';
  }

  /* ---------- feedback: "essa informação foi útil?" por categoria ---------- */
  function feedbackHTML(group){
    var voted = null;
    try { voted = localStorage.getItem(votedKey(group)); } catch (e) {}
    if (voted) return '<span class="feedback-thanks">Obrigado pelo retorno sobre “' + esc(group) + '”.</span>';
    return '<span>Essa informação foi útil?</span>' +
      '<button type="button" class="feedback-btn" data-vote="up"><svg class="icon" aria-hidden="true"><use href="#i-thumb-up"/></svg>Sim</button>' +
      '<button type="button" class="feedback-btn" data-vote="down"><svg class="icon" aria-hidden="true"><use href="#i-thumb-down"/></svg>Não</button>';
  }

  /* ---------- corrido: uma seção por grupo, todas visíveis ---------- */
  function groupBlockHTML(g){
    var items = groupsMap[g] || [];
    var amparo = items[0] && items[0].Amparo;
    var basis = AMPARO_LABELS[amparo] || amparo || "";
    return '<section class="group-block" id="grupo-' + slugify(g) + '">' +
      '<div class="content-head"><h2>' + esc(g) + '</h2><span class="content-basis">' + esc(basis) + '</span></div>' +
      '<p class="content-sub">' + esc(groupDescOf(g) || "") + '</p>' +
      (FEEDBACK_ON ? '<div class="feedback-row" data-group="' + esc(g) + '">' + feedbackHTML(g) + '</div>' : '') +
      '<div class="card-grid">' + items.map(function(item){ return cardHTML(item, false); }).join("") + '</div>' +
      '</section>';
  }
  function renderAllGroups(){
    allGroupsEl.innerHTML = groupsOrder.map(groupBlockHTML).join("");
  }
  allGroupsEl.addEventListener("click", function(e){
    var btn = e.target.closest(".feedback-btn");
    if (!btn) return;
    var row = btn.closest(".feedback-row");
    var group = row.getAttribute("data-group");
    var vote = btn.getAttribute("data-vote");
    try { localStorage.setItem(votedKey(group), vote); } catch (e) {}
    fetch(FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grupo: group, voto: vote })
    }).catch(function(){});
    row.innerHTML = feedbackHTML(group);
  });

  /* ---------- busca e perfis ---------- */
  function itemMatchesProfile(profile, item){
    var s = item._search;
    return (profile.match || []).some(function(t){ return s.indexOf(canon(t)) !== -1; });
  }
  function activeProfiles(){
    return PROFILES.filter(function(p){ return allItems.some(function(item){ return itemMatchesProfile(p, item); }); });
  }
  function foundText(n){
    var q = esc(uiState.query.trim());
    return n + (n === 1 ? " item encontrado para “" + q + "”" : " itens encontrados para “" + q + "”");
  }
  function renderResults(){
    feedbackRowEl.hidden = true; feedbackRowEl.innerHTML = "";
    var q = canon(uiState.query.trim());
    var profile = uiState.profile ? (PROFILES.filter(function(p){ return p.id === uiState.profile; })[0] || null) : null;
    if (q){
      var terms = [q];
      if (SYNONYMS[q]) terms.push(canon(SYNONYMS[q]));
      var matches = allItems.filter(function(item){
        return terms.some(function(t){ return item._search.indexOf(t) !== -1; });
      });
      titleEl.textContent = "Resultados da busca";
      basisEl.textContent = "";
      if (profile){
        var inProfile = matches.filter(function(item){ return itemMatchesProfile(profile, item); });
        var rest = matches.filter(function(item){ return !itemMatchesProfile(profile, item); });
        subEl.innerHTML = foundText(matches.length) + " — priorizando " + esc(profile.label) + ".";
        var html = "";
        if (inProfile.length){
          html += '<div class="result-group"><div class="result-group-label">' + esc(profile.label) + '</div><div class="card-grid">' +
            inProfile.map(function(item){ return cardHTML(item, true); }).join("") + '</div></div>';
        }
        if (rest.length){
          html += '<div class="result-group"><div class="result-group-label is-other">Outras categorias</div><div class="card-grid">' +
            rest.map(function(item){ return cardHTML(item, true); }).join("") + '</div></div>';
        }
        gridEl.innerHTML = html;
      } else {
        subEl.innerHTML = foundText(matches.length);
        gridEl.innerHTML = '<div class="card-grid">' + matches.map(function(item){ return cardHTML(item, true); }).join("") + '</div>';
      }
      emptyEl.style.display = matches.length === 0 ? "block" : "none";
    } else if (profile){
      var pmatches = allItems.filter(function(item){ return itemMatchesProfile(profile, item); });
      var categories = [];
      pmatches.forEach(function(item){ if (categories.indexOf(item.Grupo) === -1) categories.push(item.Grupo); });
      if (uiState.profileCategory && categories.indexOf(uiState.profileCategory) === -1) uiState.profileCategory = null;
      var shown = uiState.profileCategory ? pmatches.filter(function(item){ return item.Grupo === uiState.profileCategory; }) : pmatches;
      titleEl.textContent = profile.label;
      basisEl.textContent = "";
      subEl.textContent = "Seleção de itens relevantes para esse perfil — o índice completo continua disponível ao lado.";
      var filterHtml = categories.length > 1 ? (
        '<div class="category-filter"><label for="profileCategorySelect">Categoria</label><select id="profileCategorySelect">' +
        '<option value="">Todas as categorias</option>' +
        categories.map(function(g){
          return '<option value="' + esc(g) + '"' + (uiState.profileCategory === g ? ' selected' : '') + '>' + esc(g) + '</option>';
        }).join("") +
        '</select></div>'
      ) : "";
      gridEl.innerHTML = filterHtml + '<div class="card-grid">' + shown.map(function(item){ return cardHTML(item, true); }).join("") + '</div>';
      emptyEl.style.display = shown.length === 0 ? "block" : "none";
      var catSelect = document.getElementById("profileCategorySelect");
      if (catSelect) catSelect.addEventListener("change", function(){
        uiState.profileCategory = catSelect.value || null;
        renderResults();
      });
    }
  }
  function updateViewMode(){
    var active = !!(uiState.query || uiState.profile);
    resultsViewEl.hidden = !active;
    allGroupsEl.style.display = active ? "none" : "";
    if (active) renderResults();
  }

  /* ---------- índice: destaca a seção visível ao rolar (scrollspy) ---------- */
  var scrollSpyObserver = null;
  function setupScrollSpy(){
    if (scrollSpyObserver) scrollSpyObserver.disconnect();
    if (!("IntersectionObserver" in window)) return;
    scrollSpyObserver = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        var link = sidebarEl.querySelector('.side-item[data-target="' + entry.target.id + '"]');
        if (!link) return;
        Array.prototype.forEach.call(sidebarEl.querySelectorAll(".side-item.active"), function(el){ el.classList.remove("active"); });
        link.classList.add("active");
        if (window.matchMedia("(max-width: 820px)").matches) {
          // mobile: o índice é uma faixa horizontal — rola só a faixa, nunca a página
          sidebarEl.scrollTo({ left: link.offsetLeft - (sidebarEl.clientWidth - link.clientWidth) / 2, behavior: "smooth" });
        } else {
          link.scrollIntoView({ block: "nearest" });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    Array.prototype.forEach.call(allGroupsEl.querySelectorAll(".group-block"), function(b){ scrollSpyObserver.observe(b); });
  }

  /* ---------- atalhos por perfil ---------- */
  var profileRowEl = document.getElementById("profileRow");
  function renderProfileRow(){
    profileRowEl.innerHTML = activeProfiles().map(function(p){
      var active = uiState.profile === p.id;
      return '<button type="button" class="profile-pill' + (active ? ' active' : '') + '" data-profile="' + esc(p.id) + '">' +
        '<svg class="icon" aria-hidden="true"><use href="#' + esc(p.icon || "i-users") + '"/></svg>' + esc(p.label) + '</button>';
    }).join("");
  }
  profileRowEl.addEventListener("click", function(e){
    var btn = e.target.closest(".profile-pill");
    if (!btn) return;
    var id = btn.getAttribute("data-profile");
    uiState.profile = uiState.profile === id ? null : id;
    uiState.profileCategory = null;
    uiState.query = "";
    searchInput.value = "";
    clearBtn.style.display = "none";
    renderProfileRow(); updateViewMode();
    document.getElementById("transparencia").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("searchForm").addEventListener("submit", function(e){ e.preventDefault(); });
  searchInput.addEventListener("input", function(){
    uiState.query = searchInput.value;
    clearBtn.style.display = uiState.query ? "inline-flex" : "none";
    renderProfileRow(); updateViewMode();
  });
  clearBtn.addEventListener("click", function(){
    searchInput.value = ""; uiState.query = "";
    clearBtn.style.display = "none";
    updateViewMode(); searchInput.focus();
  });

  /* ---------- menu: parse + render ---------- */
  var MENU = obj(C.menu);
  var CURRENT_MATCH = norm(MENU.itemAtual || "transparen");
  function buildMenuTree(raw){
    raw = Array.isArray(raw) ? raw : [];
    var byId = {};
    raw.forEach(function(m){ byId[m.Id] = m; m._children = []; });
    var roots = [];
    raw.forEach(function(m){
      if (m.NMenu && byId[m.NMenu]) byId[m.NMenu]._children.push(m);
      else if (!m.NMenu) roots.push(m);
    });
    function byOrder(a, b){ return (+a.Ordem || 0) - (+b.Ordem || 0); }
    roots.sort(byOrder);
    roots.forEach(function(r){ r._children.sort(byOrder); });
    return roots;
  }

  function targetAttr(m){ return m.NovaPag === "_blank" ? ' target="_blank" rel="noopener"' : ""; }
  var navListEl = document.getElementById("navList");
  function renderNav(tree){
    navListEl.innerHTML = tree.map(function(item){
      var isCurrent = norm(item.Nome).indexOf(CURRENT_MATCH) !== -1;
      var isHome = norm(item.Nome).indexOf("inicio") !== -1;
      var homeIcon = isHome ? '<svg class="icon" aria-hidden="true"><use href="#i-home"/></svg>' : "";
      var hasChildren = item._children.length > 0;
      var caret = hasChildren ? '<svg class="icon caret" aria-hidden="true"><use href="#i-chevron-down"/></svg>' : "";
      var trigger;
      if (isCurrent){
        trigger = '<a class="nav-link" href="#transparencia">' + esc(item.Nome) + '</a>';
      } else if (hasChildren){
        trigger = '<button type="button" class="nav-btn">' + homeIcon + esc(item.Nome) + caret + '</button>';
      } else {
        trigger = '<a class="nav-link" href="' + safeHref(item.Pagina) + '"' + targetAttr(item) + '>' + homeIcon + esc(item.Nome) + '</a>';
      }
      var dropdown = hasChildren ? '<div class="dropdown">' + item._children.map(function(c){
        return '<a href="' + safeHref(c.Pagina) + '"' + targetAttr(c) + '>' + esc(c.Nome) + '</a>';
      }).join("") + '</div>' : "";
      return '<li class="nav-item' + (hasChildren ? " has-dropdown" : "") + (isCurrent ? " current" : "") + '">' + trigger + dropdown + '</li>';
    }).join("");
  }

  navListEl.addEventListener("click", function(e){
    if (e.target.closest(".nav-link")) document.getElementById("navbar").classList.remove("mobile-open");
    var btn = e.target.closest(".nav-btn");
    if (!btn) return;
    var item = btn.closest(".nav-item");
    var wasOpen = item.classList.contains("open");
    Array.prototype.forEach.call(navListEl.querySelectorAll(".nav-item.open"), function(i){ i.classList.remove("open"); });
    if (!wasOpen) item.classList.add("open");
  });
  document.addEventListener("click", function(e){
    if (!e.target.closest(".nav-item")) {
      Array.prototype.forEach.call(navListEl.querySelectorAll(".nav-item.open"), function(i){ i.classList.remove("open"); });
    }
  });
  document.getElementById("navToggle").addEventListener("click", function(){
    document.getElementById("navbar").classList.toggle("mobile-open");
  });

  document.getElementById("footerYear").textContent = new Date().getFullYear();

  /* ---------- carga dos dados: proxy -> cópia estática (sem PHP) -> arquivo local ---------- */
  var footerSync = document.getElementById("footerSync");
  function updateStatus(){
    if (!dataState.lastSync) { footerSync.textContent = "Sincronizando…"; return; }
    footerSync.textContent = dataState.live
      ? "Sincronizado com a API às " + timeNow() + "."
      : "Exibindo cópia local (última tentativa às " + timeNow() + ").";
  }

  function fetchFirst(urls){
    var i = 0;
    function next(){
      if (i >= urls.length) return Promise.reject(new Error("sem dados"));
      var url = urls[i++];
      return fetch(url, { cache: "no-store" }).then(function(r){
        if (!r.ok) throw new Error("http " + r.status);
        var source = r.headers.get("X-Data-Source");
        return r.json().then(function(data){
          if (!Array.isArray(data)) throw new Error("formato inesperado");
          return { data: data, live: i === 1 && (source === "api" || source === "cache-recente") };
        });
      }).catch(next);
    }
    return next();
  }

  var firstPaint = true;
  function load(){
    Promise.all([
      fetchFirst(TRANSPARENCIA_URLS),
      fetchFirst(MENU_URLS).catch(function(){ return { data: [], live: false }; }),
      ORDEM_AUTO ? fetchFirst(ORDEM_URLS).catch(function(){ return { data: [] }; }) : Promise.resolve({ data: [] })
    ]).then(function(res){
      aplicarOrdemOficial(res[2].data);
      parseTransparencia(res[0].data);
      renderNav(buildMenuTree(res[1].data));
      dataState.live = res[0].live;
    }).catch(function(){
      dataState.live = false;
      if (firstPaint) allGroupsEl.innerHTML = '<p class="content-sub">Não foi possível carregar os dados de transparência agora. Tente novamente em instantes.</p>';
    }).then(function(){
      dataState.lastSync = new Date();
      if (allItems.length || !firstPaint) {
        renderSidebar(); renderProfileRow(); renderAllGroups(); setupScrollSpy(); updateViewMode();
      }
      firstPaint = false;
      updateStatus();
    });
  }
  load();
  setInterval(load, REFRESH_MS);

  /* ---------- barra de acessibilidade ---------- */
  var root = document.documentElement;
  var FONT_STEPS = [0.9, 1, 1.1, 1.2, 1.3];
  var fontIdx = 1;
  var contrastBtn = document.getElementById("a11yContrast");
  try {
    var savedIdx = parseInt(localStorage.getItem("a11yFontIdx"), 10);
    if (!isNaN(savedIdx) && FONT_STEPS[savedIdx]) fontIdx = savedIdx;
    if (localStorage.getItem("a11yContrast") === "1") {
      root.setAttribute("data-contrast", "high");
      contrastBtn.classList.add("active");
      contrastBtn.setAttribute("aria-pressed", "true");
    }
  } catch (e) {}
  function applyFontScale(){
    root.style.fontSize = (FONT_STEPS[fontIdx] * 100) + "%";
    try { localStorage.setItem("a11yFontIdx", fontIdx); } catch (e) {}
  }
  applyFontScale();
  document.getElementById("a11yFontUp").addEventListener("click", function(){
    fontIdx = Math.min(fontIdx + 1, FONT_STEPS.length - 1);
    applyFontScale();
  });
  document.getElementById("a11yFontDown").addEventListener("click", function(){
    fontIdx = Math.max(fontIdx - 1, 0);
    applyFontScale();
  });
  contrastBtn.addEventListener("click", function(){
    var on = root.getAttribute("data-contrast") === "high";
    if (on) { root.removeAttribute("data-contrast"); } else { root.setAttribute("data-contrast", "high"); }
    contrastBtn.classList.toggle("active", !on);
    contrastBtn.setAttribute("aria-pressed", String(!on));
    try { localStorage.setItem("a11yContrast", on ? "0" : "1"); } catch (e) {}
  });
  var readBtn = document.getElementById("a11yReadAloud");
  readBtn.addEventListener("click", function(){
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking){
      window.speechSynthesis.cancel();
      readBtn.classList.remove("active");
      readBtn.setAttribute("aria-pressed", "false");
      return;
    }
    // lê a seção visível (índice ativo) ou o resultado da busca
    var text;
    if (!resultsViewEl.hidden) {
      var labels = Array.prototype.map.call(gridEl.querySelectorAll(".card-label"), function(el){ return el.textContent; });
      text = titleEl.textContent + ". " + labels.join(", ") + ".";
    } else {
      var activeBtn = sidebarEl.querySelector(".side-item.active") || sidebarEl.querySelector(".side-item");
      var block = activeBtn && document.getElementById(activeBtn.getAttribute("data-target"));
      if (!block) return;
      var h = block.querySelector("h2").textContent;
      var items = Array.prototype.map.call(block.querySelectorAll(".card-label"), function(el){ return el.textContent; });
      text = h + ". " + items.join(", ") + ".";
    }
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    utter.onend = function(){ readBtn.classList.remove("active"); readBtn.setAttribute("aria-pressed", "false"); };
    readBtn.classList.add("active");
    readBtn.setAttribute("aria-pressed", "true");
    window.speechSynthesis.speak(utter);
  });

  /* ---------- PWA ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  /* ---------- voltar ao topo ---------- */
  var topBtn = document.getElementById("topBtn");
  window.addEventListener("scroll", function(){ topBtn.classList.toggle("show", window.scrollY > 700); }, { passive: true });
  topBtn.addEventListener("click", function(){ window.scrollTo({ top: 0, behavior: "smooth" }); });
})();
