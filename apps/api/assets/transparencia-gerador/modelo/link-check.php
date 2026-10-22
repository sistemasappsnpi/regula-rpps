<?php
/**
 * Verifica todos os links publicados na Transparência e grava dados/link_check_report.json.
 *
 * Uso via cron (recomendado, 1x por dia, sem senha):
 *   0 6 * * * php /caminho/do/portal/link-check.php >> /caminho/do/portal/dados/link-check.log 2>&1
 *
 * Uso pelo navegador: exige o usuário e a senha do painel (admin.php). Com ?voltar=1 volta ao painel ao terminar.
 */

require __DIR__ . '/config.php';

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) require_basic_auth();
@set_time_limit(280);

// Mesma regra de endereço que o portal usa no navegador (app.js, fixLink).
function fix_link($raw, $base) {
    $raw = trim((string)$raw);
    if ($raw === '') return '#';
    if (preg_match('#^(mailto:|tel:|\#)#i', $raw)) return $raw;
    if (preg_match('#^https?://#i', $raw)) {
        $nested = preg_match('#https?://#i', substr($raw, 8), $m, PREG_OFFSET_CAPTURE) ? $m[0][1] : -1;
        if ($nested !== -1) return substr($raw, 8 + $nested);
        return preg_replace('#([^:])/{2,}#', '$1/', $raw);
    }
    if ($base === '') return $raw;
    return preg_replace('#([^:])/{2,}#', '$1/', $base . '/' . $raw);
}

function check_urls_concurrently($urls, $concurrency, $timeout) {
    $results = array();
    $queue = $urls;
    $running = array();
    $mh = curl_multi_init();

    $makeHandle = function ($url) use ($timeout) {
        $ch = curl_init();
        curl_setopt_array($ch, array(
            CURLOPT_URL => $url,
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 6,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (PortalTransparencia-LinkChecker/1.0)',
        ));
        return $ch;
    };

    $addNext = function () use (&$queue, &$running, $mh, $makeHandle) {
        if (!count($queue)) return;
        $url = array_shift($queue);
        $ch = $makeHandle($url);
        curl_multi_add_handle($mh, $ch);
        $running[(int) $ch] = array('handle' => $ch, 'url' => $url, 'retried' => false);
    };

    for ($i = 0; $i < $concurrency; $i++) $addNext();

    do {
        curl_multi_exec($mh, $active);
        while ($info = curl_multi_info_read($mh)) {
            $ch = $info['handle'];
            $id = (int) $ch;
            $entry = $running[$id];
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
            unset($running[$id]);

            // Alguns servidores recusam HEAD; refaz uma vez pedindo só o primeiro byte via GET.
            if (($code === 0 || $code === 403 || $code === 405 || $code === 501) && !$entry['retried']) {
                $ch2 = $makeHandle($entry['url']);
                curl_setopt($ch2, CURLOPT_NOBODY, false);
                curl_setopt($ch2, CURLOPT_RANGE, '0-0');
                curl_multi_add_handle($mh, $ch2);
                $running[(int) $ch2] = array('handle' => $ch2, 'url' => $entry['url'], 'retried' => true);
            } else {
                $results[$entry['url']] = $code;
                $addNext();
            }
        }
        if ($active) curl_multi_select($mh, 1.0);
    } while ($active || count($running) > 0);

    curl_multi_close($mh);
    return $results;
}

// Plano B para hospedagens sem cURL: um link por vez, com HEAD e depois GET.
function check_urls_sequential($urls, $timeout) {
    $results = array();
    foreach ($urls as $url) {
        $code = 0;
        foreach (array('HEAD', 'GET') as $method) {
            $ctx = stream_context_create(array('http' => array(
                'method' => $method, 'timeout' => $timeout, 'ignore_errors' => true, 'follow_location' => 1, 'max_redirects' => 6,
                'header' => "User-Agent: Mozilla/5.0 (PortalTransparencia-LinkChecker/1.0)\r\n",
            ), 'ssl' => array('verify_peer' => false, 'verify_peer_name' => false)));
            $http_response_header = null;
            @file_get_contents($url, false, $ctx, 0, 1);
            $code = 0;
            if (is_array($http_response_header)) {
                foreach ($http_response_header as $linha) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $linha, $m)) $code = (int) $m[1]; // a última linha vale (após redirecionamentos)
            }
            if ($code !== 0 && $code !== 403 && $code !== 405 && $code !== 501) break;
        }
        $results[$url] = $code;
    }
    return $results;
}

// Itens: dados ao vivo da API; se ela não responder, a cópia em dados/. Mais os botões extras do config.json.
$items = null;
$apiUrl = api_url('transparencia');
if ($apiUrl) {
    $context = stream_context_create(array('http' => array('timeout' => 20, 'ignore_errors' => true)));
    $raw = @file_get_contents($apiUrl, false, $context);
    $items = $raw ? json_decode($raw, true) : null;
}
if (!is_array($items)) {
    foreach (array('cache_transparencia.json', 'transparencia.local.json') as $f) {
        if (is_file(__DIR__ . "/dados/$f")) { $items = json_decode((string)file_get_contents(__DIR__ . "/dados/$f"), true); break; }
    }
}
if (!is_array($items)) {
    $msg = 'Não foi possível obter a lista de links (API fora do ar e sem cópia em dados/).';
    if ($isCli) { fwrite(STDERR, $msg . "\n"); exit(1); }
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('error' => $msg));
    exit;
}
foreach ((array)cfg('itensExtras', array()) as $extra) {
    if (is_array($extra) && !empty($extra['Grupo']) && !empty($extra['Descricao'])) $items[] = $extra;
}

$base = rtrim((string)cfg('api.dominioLinks', cfg('api.base', '')), '/');
$byHref = array();
$semLink = array();
foreach ($items as $item) {
    $grupo = isset($item['Grupo']) ? $item['Grupo'] : '';
    $desc = isset($item['Descricao']) ? $item['Descricao'] : '';
    $href = fix_link(isset($item['Link']) ? $item['Link'] : '', $base);
    $uso = array('grupo' => $grupo, 'descricao' => $desc);
    if ($href === '#' || $href === '') { $semLink[] = $uso; continue; }
    if (preg_match('#^(mailto:|tel:|\#)#i', $href) || !preg_match('#^https?://#i', $href)) continue;
    if (!isset($byHref[$href])) $byHref[$href] = array();
    $byHref[$href][] = $uso;
}

$hrefs = array_keys($byHref);
$curlDisponivel = function_exists('curl_multi_init');

$itensQuebrados = array();
$statuses = $curlDisponivel ? check_urls_concurrently($hrefs, 8, 12) : check_urls_sequential($hrefs, 8);
foreach ($hrefs as $href) {
    $status = isset($statuses[$href]) ? $statuses[$href] : 0;
    if ($status < 200 || $status >= 400) $itensQuebrados[] = array('href' => $href, 'status' => $status, 'usos' => $byHref[$href]);
}

$out = array(
    'verificadoEm' => date('d/m/Y H:i'),
    'totalLinks' => count($hrefs),
    'quebrados' => count($itensQuebrados),
    'semLink' => count($semLink),
    'itensQuebrados' => $itensQuebrados,
    'itensSemLink' => $semLink,
    'curlDisponivel' => $curlDisponivel,
);

if (!is_dir(__DIR__ . '/dados')) @mkdir(__DIR__ . '/dados', 0775, true);
file_put_contents(__DIR__ . '/dados/link_check_report.json', json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

if ($isCli) {
    echo $out['quebrados'] . ' link(s) quebrado(s) de ' . $out['totalLinks'] . " verificados.\n";
    foreach ($itensQuebrados as $b) {
        echo '  [' . $b['status'] . '] ' . $b['href'] . ' (' . $b['usos'][0]['grupo'] . ' - ' . $b['usos'][0]['descricao'] . ")\n";
    }
    if ($out['semLink']) echo $out['semLink'] . " item(ns) sem link cadastrado na origem.\n";
} elseif (isset($_GET['voltar'])) {
    header('Location: admin.php');
} else {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
