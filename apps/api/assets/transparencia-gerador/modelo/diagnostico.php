<?php
// Checagem rápida da implantação: API responde? Quais grupos vieram? Falta ícone/descrição em algum?
// Abra /diagnostico.php no navegador. Pode apagar este arquivo depois que o portal estiver no ar.
require __DIR__ . '/config.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

function norm_key($s) {
    // sem mbstring (nem toda hospedagem tem): tira acentos e só então baixa a caixa
    $s = strtr(trim((string)$s), array(
        'á'=>'a','à'=>'a','ã'=>'a','â'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','õ'=>'o','ô'=>'o','ú'=>'u','ü'=>'u','ç'=>'c',
        'Á'=>'a','À'=>'a','Ã'=>'a','Â'=>'a','É'=>'e','Ê'=>'e','Í'=>'i','Ó'=>'o','Õ'=>'o','Ô'=>'o','Ú'=>'u','Ü'=>'u','Ç'=>'c'));
    return preg_replace('/\s+/', ' ', strtolower($s));
}
function keys_of($arr) { return array_map('norm_key', array_keys((array)$arr)); }

$checks = array();
foreach (array('menu', 'transparencia') as $d) {
    $url = api_url($d);
    $t = microtime(true);
    $data = null; $erro = '';
    if ($url) {
        $ctx = stream_context_create(array('http' => array('timeout' => 8, 'ignore_errors' => true)));
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) $erro = 'sem resposta (timeout, DNS ou HTTPS bloqueado no servidor)';
        else { $data = json_decode($raw, true); if (!is_array($data)) { $data = null; $erro = 'resposta não é JSON: ' . preg_replace('/^(.{0,120}).*$/su', '$1', trim(strip_tags($raw))); } }
    } else {
        $erro = 'API desligada no config (usa dados/' . $d . '.local.json)';
    }
    $checks[$d] = array('url' => $url, 'ms' => round((microtime(true) - $t) * 1000), 'data' => $data, 'erro' => $erro,
        'cache' => is_file(__DIR__ . "/dados/cache_$d.json") ? date('d/m/Y H:i', filemtime(__DIR__ . "/dados/cache_$d.json")) : null,
        'local' => is_file(__DIR__ . "/dados/$d.local.json"));
}

$grupos = array();
$itens = $checks['transparencia']['data'];
if (!$itens) {
    foreach (array('cache_transparencia.json', 'transparencia.local.json') as $f) {
        if (is_file(__DIR__ . "/dados/$f")) { $itens = json_decode(file_get_contents(__DIR__ . "/dados/$f"), true); break; }
    }
}
foreach ((array)$itens as $it) {
    $g = isset($it['Grupo']) ? $it['Grupo'] : '(sem grupo)';
    if (!isset($grupos[$g])) $grupos[$g] = 0;
    $grupos[$g]++;
}
$ordem = array_map('norm_key', (array)cfg('grupos.ordem', array()));
$icones = keys_of(cfg('grupos.icones', array()));
$descs = keys_of(cfg('grupos.descricoes', array()));
$logoOk = is_file(__DIR__ . '/' . cfg('cliente.logo', 'logo.png'));
?><!DOCTYPE html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagnóstico — <?= h(cfg('cliente.nome', 'Portal')) ?></title>
<style>
  body{font:15px/1.5 system-ui,Segoe UI,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#16233a;background:#f4f6f9}
  h1{font-size:1.4rem} h2{font-size:1.1rem;margin-top:2rem}
  .box{background:#fff;border:1px solid #dde3ec;border-radius:10px;padding:1rem 1.2rem;margin:.6rem 0}
  .ok{color:#2f7a3d;font-weight:700} .bad{color:#b5342f;font-weight:700} .warn{color:#a66b00;font-weight:700}
  code{background:#eef1f5;padding:.1rem .35rem;border-radius:4px;word-break:break-all}
  table{border-collapse:collapse;width:100%;background:#fff} td,th{border:1px solid #dde3ec;padding:.4rem .6rem;text-align:left;font-size:.9rem}
</style>
<h1>Diagnóstico do portal — <?= h(cfg('cliente.nome', 'Portal')) ?></h1>

<div class="box">Logo <code><?= h(cfg('cliente.logo', 'logo.png')) ?></code>:
  <?= $logoOk ? '<span class="ok">encontrado</span>' : '<span class="bad">arquivo não encontrado na pasta</span>' ?></div>

<?php foreach ($checks as $d => $c): ?>
<h2>API: <?= h($d) ?></h2>
<div class="box">
  <?php if ($c['url']): ?><div>URL: <code><?= h($c['url']) ?></code></div><?php endif; ?>
  <?php if ($c['data'] !== null): ?>
    <div class="ok">OK — <?= count($c['data']) ?> registros em <?= $c['ms'] ?> ms</div>
  <?php else: ?>
    <div class="<?= $c['url'] ? 'bad' : 'warn' ?>"><?= h($c['erro']) ?></div>
  <?php endif; ?>
  <div>Último cache salvo: <?= $c['cache'] ? h($c['cache']) : '<span class="warn">nenhum</span>' ?>
    · Arquivo local de reserva: <?= $c['local'] ? 'sim' : 'não' ?></div>
</div>
<?php endforeach; ?>

<h2>Ordem de exibição</h2>
<?php
require_once __DIR__ . '/ordem.php';
$auto = cfg('grupos.ordemAutomatica', true) !== false;
$pagina = cfg('api.paginaOficial', '');
if ($pagina === '' && cfg('api.base', '')) $pagina = ordem_url(cfg('api.base'));
$ordemCache = is_file(__DIR__ . '/dados/cache_ordem.json') ? json_decode(file_get_contents(__DIR__ . '/dados/cache_ordem.json'), true) : null;
?>
<div class="box">
  <?php if (!$auto): ?>
    <div class="warn">Ordem fixada no config.json (grupos.ordem). A página oficial não é consultada.</div>
  <?php elseif ($pagina === ''): ?>
    <div class="warn">Sem página oficial configurada: as categorias seguem a ordem em que a API as devolve.</div>
  <?php else: ?>
    <div>Lida de <code><?= h($pagina) ?></code></div>
    <div class="<?= $ordemCache ? 'ok' : 'bad' ?>"><?= $ordemCache ? count($ordemCache) . ' categorias com ordem própria (e a ordem dos botões de cada uma)' : 'ainda não foi possível ler essa página' ?></div>
  <?php endif; ?>
</div>

<h2>Grupos da transparência (<?= count($grupos) ?>)</h2>
<?php if ($grupos): ?>
<table>
  <tr><th>Grupo (como vem da API)</th><th>Itens</th><th>Na ordem?</th><th>Ícone</th><th>Descrição</th></tr>
  <?php foreach ($grupos as $g => $n): $k = norm_key($g); ?>
  <tr>
    <td><?= h($g) ?></td><td><?= $n ?></td>
    <td><?= in_array($k, $ordem, true) ? '<span class="ok">sim</span>' : '<span class="warn">no fim</span>' ?></td>
    <td><?= in_array($k, $icones, true) ? '<span class="ok">sim</span>' : 'automático' ?></td>
    <td><?= in_array($k, $descs, true) ? '<span class="ok">sim</span>' : '<span class="warn">vazia</span>' ?></td>
  </tr>
  <?php endforeach; ?>
</table>
<p>Para mudar a ordem, o ícone ou a descrição de um grupo, edite <code>grupos</code> no <code>config.json</code>
  (maiúsculas e acentos não importam).</p>
<?php else: ?>
<div class="box bad">Nenhum dado de transparência disponível ainda.</div>
<?php endif; ?>
