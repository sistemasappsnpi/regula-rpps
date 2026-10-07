<?php
require __DIR__ . '/config.php';
header('Content-Type: application/manifest+json; charset=utf-8');

$nome = cfg('cliente.nome', 'Portal');
$icone = cfg('cliente.icone', cfg('cliente.logo', 'logo.png'));
$colors = portal_colors();

echo json_encode(array(
    'name' => 'Portal da Transparência — ' . $nome,
    'short_name' => 'Transparência ' . $nome,
    'description' => cfg('seo.descricao', 'Portal da Transparência e Acesso à Informação.'),
    'start_url' => './',
    'scope' => './',
    'display' => 'standalone',
    'background_color' => '#f4f6f9',
    'theme_color' => $colors['primary'],
    'lang' => 'pt-BR',
    'icons' => array(array('src' => $icone, 'sizes' => '260x260', 'type' => 'image/png', 'purpose' => 'any')),
), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
