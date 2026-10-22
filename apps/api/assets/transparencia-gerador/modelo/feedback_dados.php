<?php
// Entrega os votos de "essa informação foi útil?" para o Regula (aba do gerador de transparência).
// Só responde a quem manda o token de segredo.php (cabeçalho X-Portal-Token ou ?t=).
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

$seg = portal_segredo();
$enviado = isset($_SERVER['HTTP_X_PORTAL_TOKEN']) ? $_SERVER['HTTP_X_PORTAL_TOKEN'] : (isset($_GET['t']) ? $_GET['t'] : '');
if (empty($seg['token']) || !igual_seguro($seg['token'], $enviado)) {
    http_response_code(403);
    echo json_encode(array('ok' => false, 'error' => 'token invalido'));
    exit;
}

$file = __DIR__ . '/dados/feedback_data.json';
$votos = array();
if (is_file($file)) {
    $d = json_decode((string)file_get_contents($file), true);
    if (is_array($d)) $votos = $d;
}
echo json_encode(array(
    'ok' => true,
    'votos' => (object)$votos,
    'atualizadoEm' => is_file($file) ? date('c', filemtime($file)) : null,
), JSON_UNESCAPED_UNICODE);
