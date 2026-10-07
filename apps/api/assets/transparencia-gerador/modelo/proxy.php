<?php
// Repassa a API de dados abertos do cliente (URL definida no config.json) com cache em disco.
// Ordem de tentativa: cache recente -> API ao vivo -> ultimo cache salvo -> arquivo local (dados/<d>.local.json).
require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$d = isset($_GET['d']) ? $_GET['d'] : '';
if ($d !== 'menu' && $d !== 'transparencia' && $d !== 'ordem') {
    http_response_code(400);
    echo json_encode(array('error' => 'parametro d invalido'));
    exit;
}

$dir = __DIR__ . '/dados';
$cacheFile = "$dir/cache_$d.json";
$localFile = "$dir/$d.local.json";
$fresh = (int)cfg('api.cacheSegundos', 60);

// "ordem" não é um conjunto da API: é a ordem de exibição lida da página oficial do cliente
if ($d === 'ordem') {
    require __DIR__ . '/ordem.php';
    $pagina = cfg('api.paginaOficial', '');
    if ($pagina === '' && cfg('api.base', '')) $pagina = ordem_url(cfg('api.base'));
    if ($pagina === '' || cfg('grupos.ordemAutomatica', true) === false) {
        echo '[]';
        exit;
    }
    if (is_file($cacheFile) && time() - filemtime($cacheFile) < max($fresh, 300)) {
        header('X-Data-Source: cache-recente');
        readfile($cacheFile);
        exit;
    }
    $ordem = buscar_ordem($pagina);
    if ($ordem) {
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        @file_put_contents($cacheFile, json_encode($ordem, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
        header('X-Data-Source: api');
        echo json_encode($ordem, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } elseif (is_file($cacheFile)) {
        @touch($cacheFile);
        header('X-Data-Source: cache');
        readfile($cacheFile);
    } else {
        echo '[]';
    }
    exit;
}

$url = api_url($d);

if ($url && is_file($cacheFile) && time() - filemtime($cacheFile) < $fresh) {
    header('X-Data-Source: cache-recente');
    readfile($cacheFile);
    exit;
}

if ($url) {
    $context = stream_context_create(array(
        'http' => array('timeout' => 8, 'ignore_errors' => true, 'header' => "User-Agent: PortalTransparencia/1.0\r\n"),
    ));
    $data = @file_get_contents($url, false, $context);
    if ($data !== false && is_array(json_decode($data, true))) {
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        @file_put_contents($cacheFile, $data, LOCK_EX);
        header('X-Data-Source: api');
        echo $data;
        exit;
    }
}

if (is_file($cacheFile)) {
    if ($url) @touch($cacheFile); // API fora: espera cacheSegundos antes de tentar a origem de novo
    header('X-Data-Source: cache');
    readfile($cacheFile);
} elseif (is_file($localFile)) {
    header('X-Data-Source: local');
    readfile($localFile);
} else {
    http_response_code(502);
    echo json_encode(array('error' => 'API de origem indisponivel e sem copia local'));
}
