<?php
// Painel interno do portal: avaliações por categoria e saúde dos links. Acesso com usuário e senha (segredo.php).
require __DIR__ . '/config.php';
require_basic_auth();
header('X-Robots-Tag: noindex, nofollow');

function read_json($path) {
    if (!file_exists($path)) return null;
    $data = json_decode((string)file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

$feedback = read_json(__DIR__ . '/dados/feedback_data.json') ?: array();
$linkReport = read_json(__DIR__ . '/dados/link_check_report.json');

$feedbackRows = array();
foreach ($feedback as $grupo => $votos) {
    $up = isset($votos['up']) ? (int) $votos['up'] : 0;
    $down = isset($votos['down']) ? (int) $votos['down'] : 0;
    $total = $up + $down;
    $pct = $total ? round(($up / $total) * 100) : null;
    $feedbackRows[] = array('grupo' => $grupo, 'up' => $up, 'down' => $down, 'total' => $total, 'pct' => $pct);
}
usort($feedbackRows, function ($a, $b) {
    // pior avaliação primeiro (menor % de "sim"), depois mais votado primeiro
    if ($a['pct'] === $b['pct']) return $b['total'] - $a['total'];
    if ($a['pct'] === null) return 1;
    if ($b['pct'] === null) return -1;
    return $a['pct'] - $b['pct'];
});
?>
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Painel — Transparência <?php echo h(cfg('cliente.nome', '')); ?></title>
<style>
  :root{ --ink:#16233a; --muted:#667082; --primary:<?php echo h(cfg('cores.primaria', '#004080')); ?>; --line:#dfe4ec; --paper:#f4f6f9; --card:#fff; --ok:#1f7a4d; --bad:#b5342f; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif; padding:2rem 1.25rem 4rem; }
  h1{ font-size:1.4rem; margin:0 0 .3rem; }
  h2{ font-size:1.05rem; margin:2rem 0 .8rem; }
  .sub{ color:var(--muted); margin:0 0 1.6rem; font-size:.9rem; }
  .card{ background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:auto; max-width:920px; }
  table{ width:100%; border-collapse:collapse; }
  th,td{ text-align:left; padding:.65rem .9rem; border-bottom:1px solid var(--line); font-size:.88rem; }
  th{ background:#f0f3f8; font-size:.72rem; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); }
  tr:last-child td{ border-bottom:none; }
  .pct-bar{ display:inline-block; width:70px; height:6px; border-radius:4px; background:#e3e8f0; overflow:hidden; vertical-align:middle; margin-right:.5rem; }
  .pct-fill{ height:100%; background:var(--ok); }
  .pct-fill.low{ background:var(--bad); }
  .status-ok{ color:var(--ok); font-weight:600; }
  .status-bad{ color:var(--bad); font-weight:600; }
  .empty{ padding:1.2rem; color:var(--muted); font-size:.88rem; }
  a{ color:var(--primary); }
  .btn{ display:inline-block; margin-top:.8rem; padding:.45rem .9rem; border:1px solid var(--primary); border-radius:8px; text-decoration:none; font-weight:600; font-size:.85rem; }
  code{ background:#eef1f6; padding:.1rem .35rem; border-radius:4px; font-size:.82rem; }
</style>
</head>
<body>
  <h1>Painel interno — Portal da Transparência</h1>
  <p class="sub">Acesso restrito. Não é indexado por buscadores e não faz parte da navegação pública.</p>

  <h2>Feedback por categoria ("essa informação foi útil?")</h2>
  <div class="card">
    <?php if (!count($feedbackRows)): ?>
      <div class="empty">Ainda não há votos registrados.</div>
    <?php else: ?>
    <table>
      <thead><tr><th>Categoria</th><th>Sim</th><th>Não</th><th>% de aprovação</th></tr></thead>
      <tbody>
        <?php foreach ($feedbackRows as $r): ?>
        <tr>
          <td><?php echo h($r['grupo']); ?></td>
          <td><?php echo $r['up']; ?></td>
          <td><?php echo $r['down']; ?></td>
          <td>
            <?php if ($r['pct'] === null): ?>
              —
            <?php else: ?>
              <span class="pct-bar"><span class="pct-fill<?php echo $r['pct'] < 60 ? ' low' : ''; ?>" style="width:<?php echo (int) $r['pct']; ?>%"></span></span><?php echo (int) $r['pct']; ?>%
            <?php endif; ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
  </div>

  <h2>Saúde dos links publicados</h2>
  <div class="card">
    <?php if (!$linkReport): ?>
      <div class="empty">
        Nenhuma verificação rodou ainda. Rode agora pelo botão abaixo ou configure o cron descrito no topo de <code>link-check.php</code>.
      </div>
    <?php else: ?>
      <div class="empty" style="border-bottom:1px solid var(--line)">
        Última verificação: <strong><?php echo h($linkReport['verificadoEm']); ?></strong> ·
        <?php echo (int) $linkReport['totalLinks']; ?> links verificados ·
        <span class="<?php echo $linkReport['quebrados'] ? 'status-bad' : 'status-ok'; ?>"><?php echo (int) $linkReport['quebrados']; ?> quebrado(s)</span> ·
        <?php echo (int) $linkReport['semLink']; ?> sem link cadastrado
        <?php if (empty($linkReport['curlDisponivel'])): ?>
          <br><span class="status-bad">Observação: a extensão cURL do PHP não está ativa neste servidor; a checagem foi feita um link por vez (mais lenta).</span>
        <?php endif; ?>
      </div>
      <?php if (count($linkReport['itensQuebrados'])): ?>
      <table>
        <thead><tr><th>Status</th><th>Link</th><th>Onde aparece</th></tr></thead>
        <tbody>
          <?php foreach ($linkReport['itensQuebrados'] as $item): ?>
          <tr>
            <td class="status-bad"><?php echo (int) $item['status'] ?: 'sem resposta'; ?></td>
            <td><a href="<?php echo h($item['href']); ?>" target="_blank" rel="noopener"><?php echo h($item['href']); ?></a></td>
            <td><?php echo h(implode(', ', array_map(function ($u) { return $u['grupo'] . ' — ' . $u['descricao']; }, $item['usos']))); ?></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
      <?php else: ?>
        <div class="empty">Nenhum link quebrado na última verificação.</div>
      <?php endif; ?>
    <?php endif; ?>
  </div>
  <a class="btn" href="link-check.php?voltar=1">Verificar links agora</a>
  <span class="sub"> (pode levar alguns minutos)</span>
</body>
</html>
