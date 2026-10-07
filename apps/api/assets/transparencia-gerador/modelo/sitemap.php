<?php
// sitemap.xml do portal (servido por este arquivo via .htaccess). Usa seo.url do config.json.
require __DIR__ . '/config.php';
header('Content-Type: application/xml; charset=utf-8');

$url = rtrim((string)cfg('seo.url', ''), '/');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
if ($url !== '') {
    echo "  <url>\n    <loc>" . h($url . '/') . "</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n";
}
echo '</urlset>' . "\n";
