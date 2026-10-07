<?php
// Lê o config.json do cliente. Único lugar que conhece o formato do arquivo.

function portal_config() {
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $file = __DIR__ . '/config.json';
    $raw = @file_get_contents($file);
    if ($raw === false) portal_config_fail('config.json nao encontrado');
    $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw); // BOM salvo por alguns editores no Windows
    $cfg = json_decode($raw, true);
    if (!is_array($cfg)) portal_config_fail('config.json invalido: ' . json_last_error_msg());
    return $cfg;
}

function portal_config_fail($msg) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Erro de configuracao do portal: $msg\n";
    exit;
}

function cfg($path, $default = null) {
    $node = portal_config();
    foreach (explode('.', $path) as $key) {
        if (!is_array($node) || !array_key_exists($key, $node)) return $default;
        $node = $node[$key];
    }
    return ($node === null || $node === '') ? $default : $node;
}

function h($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

// Mistura uma cor hex com branco (t > 0) ou preto (t < 0). Usado para derivar a paleta a partir de 2 cores.
function mix_color($hex, $t) {
    $hex = ltrim($hex, '#');
    if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
    if (!preg_match('/^[0-9a-fA-F]{6}$/', $hex)) return '#000000';
    $out = '#';
    foreach (str_split($hex, 2) as $c) {
        $v = hexdec($c);
        $v = $t >= 0 ? $v + (255 - $v) * $t : $v * (1 + $t);
        $out .= str_pad(dechex((int)round(max(0, min(255, $v)))), 2, '0', STR_PAD_LEFT);
    }
    return $out;
}

function portal_colors() {
    $p = cfg('cores.primaria', '#107078');
    $a = cfg('cores.destaque', '#98c810');
    return array(
        'primary'       => $p,
        'primary-dark'  => cfg('cores.primariaEscura', mix_color($p, -0.32)),
        'primary-soft'  => cfg('cores.primariaSuave', mix_color($p, 0.86)),
        'accent'        => $a,
        'accent-strong' => cfg('cores.destaqueForte', mix_color($a, -0.44)),
        'sidebar-bg'    => cfg('cores.lateral', mix_color($p, 0.92)),
        'sidebar-item'  => cfg('cores.lateralItem', mix_color($p, 0.86)),
        'footer-bg'     => cfg('cores.rodape', cfg('cores.primariaEscura', mix_color($p, -0.32))),
    );
}

// URL da API de dados abertos para um conjunto ("menu" ou "transparencia").
// Usa a URL completa do config (api.urlMenu / api.urlTransparencia) ou monta a partir de api.base.
function api_url($d) {
    if (cfg("api.$d", true) === false) return null;
    $full = cfg('api.url' . ucfirst($d), '');
    if ($full) return $full;
    $base = rtrim((string)cfg('api.base', ''), '/');
    if ($base === '') return null;
    $path = '/' . ltrim((string)cfg('api.caminho', '/dadosabertosexportar'), '/');
    $limit = (int)cfg('api.itensPorPagina', 1000000);
    return $base . $path . '?d=' . urlencode($d) . '&a=&f=json&itens_por_pagina=' . $limit;
}
