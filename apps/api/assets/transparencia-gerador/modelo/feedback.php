<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('error' => 'metodo nao permitido'));
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$grupo = isset($body['grupo']) ? trim((string)$body['grupo']) : '';
$voto = isset($body['voto']) ? trim((string)$body['voto']) : '';

if ($grupo === '' || strlen($grupo) > 400 || !in_array($voto, array('up', 'down'), true)) {
    http_response_code(400);
    echo json_encode(array('error' => 'dados invalidos'));
    exit;
}

$dir = __DIR__ . '/dados';
if (!is_dir($dir)) @mkdir($dir, 0775, true);
$file = $dir . '/feedback_data.json';
$fp = fopen($file, 'c+');
if (!$fp) {
    http_response_code(500);
    echo json_encode(array('error' => 'nao foi possivel gravar o feedback'));
    exit;
}

flock($fp, LOCK_EX);
$raw = stream_get_contents($fp);
$data = json_decode($raw, true);
if (!is_array($data)) $data = array();
if (!isset($data[$grupo])) $data[$grupo] = array('up' => 0, 'down' => 0);
$data[$grupo][$voto]++;

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(array('ok' => true));
