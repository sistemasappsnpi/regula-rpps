<?php
// robots.txt do portal (servido por este arquivo via .htaccess; sem Apache, publique um robots.txt estático equivalente).
require __DIR__ . '/config.php';
header('Content-Type: text/plain; charset=utf-8');

$url = rtrim((string)cfg('seo.url', ''), '/');
echo "User-agent: *\nAllow: /\nDisallow: /feedback.php\nDisallow: /dados/\n";
if ($url !== '') echo "\nSitemap: $url/sitemap.xml\n";
