<?php
// Página do portal. NÃO precisa editar este arquivo para um cliente novo — tudo vem do config.json.
require __DIR__ . '/config.php';

$nome         = cfg('cliente.nome', 'Portal');
$nomeCompleto = cfg('cliente.nomeCompleto', $nome);
$logo         = cfg('cliente.logo', 'logo.png');
$icone        = cfg('cliente.icone', $logo);
$site         = cfg('cliente.site', '#');
$urlPortal    = cfg('seo.url', '');
$descricao    = cfg('seo.descricao', "Portal da Transparência do $nome — contas públicas, licitações, folha de pagamento, atas, relatórios e dados abertos, conforme a Lei de Acesso à Informação.");
$titulo       = cfg('textos.titulo', 'Acesso à Informação');
$colors       = portal_colors();
$absIcon      = $urlPortal ? rtrim($urlPortal, '/') . '/' . $icone : $icone;

$redesIcones = array('youtube' => 'i-youtube', 'x' => 'i-x', 'twitter' => 'i-x', 'instagram' => 'i-instagram', 'facebook' => 'i-facebook');
$redesNomes  = array('youtube' => 'YouTube', 'x' => 'X (Twitter)', 'twitter' => 'X (Twitter)', 'instagram' => 'Instagram', 'facebook' => 'Facebook');
$redes = array_filter((array)cfg('cliente.redes', array()), function ($r) { return !empty($r['url']); });

$contatos = array();
if (cfg('cliente.cnpj'))     $contatos[0][] = array('i-card', h('CNPJ: ' . cfg('cliente.cnpj')));
if (cfg('cliente.endereco')) $contatos[0][] = array('i-pin', h(cfg('cliente.endereco')));
if (cfg('cliente.telefone')) $contatos[1][] = array('i-phone', h(cfg('cliente.telefone')));
if (cfg('cliente.email'))    $contatos[1][] = array('i-mail', '<a href="mailto:' . h(cfg('cliente.email')) . '">' . h(cfg('cliente.email')) . '</a>');

$configJson = json_encode(portal_config(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
$v = @filemtime(__DIR__ . '/assets/app.js') . '-' . @filemtime(__DIR__ . '/assets/app.css');
?><!DOCTYPE html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h("$titulo — $nome") ?></title>
<meta name="description" content="<?= h($descricao) ?>">
<meta name="robots" content="index, follow">
<?php if ($urlPortal): ?>
<link rel="canonical" href="<?= h($urlPortal) ?>">
<meta property="og:url" content="<?= h($urlPortal) ?>">
<?php endif; ?>
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="<?= h($nome) ?>">
<meta property="og:title" content="<?= h("Portal da Transparência — $nome") ?>">
<meta property="og:description" content="<?= h($descricao) ?>">
<meta property="og:image" content="<?= h($absIcon) ?>">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" href="<?= h($icone) ?>">
<link rel="apple-touch-icon" href="<?= h($icone) ?>">
<link rel="manifest" href="manifest.php">
<meta name="theme-color" content="<?= h($colors['primary']) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="assets/app.css?v=<?= h($v) ?>">
<style>
  :root{<?php foreach ($colors as $k => $c) echo '--' . $k . ':' . h($c) . ';'; ?>}
</style>

<header class="masthead">
  <div class="masthead-inner">
    <a class="logo-link" href="<?= h($site) ?>" aria-label="<?= h($nome) ?> — página inicial">
      <img src="<?= h($logo) ?>" alt="<?= h("$nome — $nomeCompleto") ?>">
    </a>
  </div>
</header>

<nav class="navbar" id="navbar">
  <div class="navbar-inner">
    <ul class="nav-list" id="navList"></ul>
    <button class="nav-toggle" id="navToggle" aria-label="Abrir menu"><svg class="icon" aria-hidden="true"><use href="#i-menu"/></svg></button>
  </div>
</nav>

<div class="dock-search" id="dockSearch" aria-hidden="true">
  <div class="search-box">
    <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
    <input id="dockInput" type="text" placeholder="<?= h(cfg('textos.placeholderDock', 'Pesquisar em toda a transparência…')) ?>" aria-label="Pesquisar em toda a transparência">
    <button type="button" class="clear-btn" id="dockClear" aria-label="Limpar busca"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
  </div>
</div>

<section id="transparencia">
  <div class="hero">
    <div class="hero-panel">
      <h2><?= h($titulo) ?></h2>
      <p><?= h(cfg('textos.subtitulo', 'Todas as categorias em uma página só. Use a busca ou o índice ao lado para ir direto ao que precisa.')) ?></p>
      <form class="search-form" id="searchForm">
        <div class="search-box">
          <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
          <input id="searchInput" type="text" placeholder="<?= h(cfg('textos.placeholderBusca', 'Ex.: licitações, folha de pagamento, atas, ouvidoria...')) ?>" data-placeholder-curto="<?= h(cfg('textos.placeholderCurto', 'Pesquisar na transparência…')) ?>" aria-label="Pesquisar item de transparência">
          <button type="button" class="clear-btn" id="clearSearch" aria-label="Limpar busca"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
        </div>
        <button class="search-submit" type="submit">Buscar <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>
      </form>
      <nav class="profile-row" id="profileRow" aria-label="Atalhos por perfil"></nav>
    </div>
  </div>

  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Índice de categorias"></nav>
    <main>
      <div id="resultsView" hidden>
        <div class="content-head">
          <h2 id="contentTitle"></h2>
          <span class="content-basis" id="contentBasis"></span>
        </div>
        <p class="content-sub" id="contentSub"></p>
        <div class="feedback-row" id="feedbackRow" hidden></div>
        <div class="profile-hint" id="profileHint" hidden></div>
        <div class="card-grid" id="cardGrid"></div>
        <div class="empty-state" id="emptyState">
          <svg class="icon" aria-hidden="true"><use href="#i-question"/></svg>
          <p>Nenhum item encontrado para esta busca.</p>
        </div>
        <section class="related-block" id="relatedBlock" hidden>
          <h3>Itens relacionados</h3>
          <p class="content-sub" id="relatedSub"></p>
          <div class="card-grid" id="relatedGrid"></div>
        </section>
      </div>
      <div id="allGroups"></div>
    </main>
  </div>
</section>

<footer>
  <div class="footer-main">
    <div class="footer-col footer-col-brand">
      <p class="footer-brand-name"><?= h($nomeCompleto === $nome ? $nome : "$nome - $nomeCompleto") ?></p>
    </div>
<?php foreach (array(0, 1) as $col): ?>
    <div class="footer-col">
      <ul class="footer-contact">
<?php foreach (isset($contatos[$col]) ? $contatos[$col] : array() as $c): ?>
        <li><svg class="icon" aria-hidden="true"><use href="#<?= $c[0] ?>"/></svg><span><?= $c[1] ?></span></li>
<?php endforeach; ?>
      </ul>
    </div>
<?php endforeach; ?>
  </div>
<?php if ($redes): ?>
  <div class="footer-social">
<?php foreach ($redes as $r): $t = strtolower(isset($r['tipo']) ? $r['tipo'] : ''); ?>
    <a href="<?= h($r['url']) ?>" target="_blank" rel="noopener" aria-label="<?= h(isset($redesNomes[$t]) ? $redesNomes[$t] : $t) ?>"><svg class="icon" aria-hidden="true"><use href="#<?= isset($redesIcones[$t]) ? $redesIcones[$t] : 'i-globe' ?>"/></svg></a>
<?php endforeach; ?>
  </div>
<?php endif; ?>
  <div class="footer-bottom">
    © <span id="footerYear"></span> . Todos os direitos reservados.
    <div class="footer-sync"><?= h($nome) ?> · Portal de Acesso à Informação — dados extraídos da API oficial de dados abertos. <span class="mono" id="footerSync">Sincronizando…</span></div>
  </div>
</footer>

<button class="top-btn" id="topBtn" aria-label="Voltar ao topo"><svg class="icon" aria-hidden="true"><use href="#i-chevron-up"/></svg></button>

<?php if (cfg('acessibilidade.vlibras', true)): ?>
<div vw class="enabled">
  <div vw-access-button class="active"></div>
  <div vw-plugin-wrapper>
    <div class="vw-plugin-top-wrapper"></div>
  </div>
</div>
<script src="https://vlibras.gov.br/app/vlibras-plugin.js"></script>
<script>
  if (window.VLibras) { new window.VLibras.Widget("https://vlibras.gov.br/app"); }
</script>
<?php endif; ?>

<button type="button" class="a11y-toggle" id="a11yToggle" aria-expanded="false" aria-controls="a11yTools" aria-label="Opções de acessibilidade">Aa</button>
<div class="a11y-toolbar" id="a11yTools" role="group" aria-label="Acessibilidade">
  <button class="a11y-btn" id="a11yContrast" aria-label="Alternar alto contraste" aria-pressed="false"><svg class="icon" aria-hidden="true"><use href="#i-contrast"/></svg></button>
  <button class="a11y-btn" id="a11yFontDown" aria-label="Diminuir fonte">A-</button>
  <button class="a11y-btn" id="a11yFontUp" aria-label="Aumentar fonte">A+</button>
  <button class="a11y-btn" id="a11yReadAloud" aria-label="Ouvir o conteúdo da seção atual" aria-pressed="false"><svg class="icon" aria-hidden="true"><use href="#i-speaker"/></svg></button>
</div>

<?php readfile(__DIR__ . '/partes/icones.svg'); ?>

<script>window.PORTAL_CONFIG = <?= $configJson ?>;</script>
<script src="assets/app.js?v=<?= h($v) ?>"></script>
