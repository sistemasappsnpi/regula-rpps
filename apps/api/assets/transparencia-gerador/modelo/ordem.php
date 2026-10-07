<?php
// A API de dados abertos não manda ordem de exibição: nem das categorias, nem dos itens dentro delas.
// A ordem oficial está na página de acesso à informação do próprio cliente, que é lida e interpretada aqui.
// Resultado: [ { "nome": "Atendimento ao Cidadão", "itens": ["E-sic", "Ouvidoria Municipal"] }, ... ]

function ordem_url($base) {
    return rtrim((string)$base, '/') . '/acessoainformacao';
}

function limpar_texto($s) {
    $s = html_entity_decode(strip_tags((string)$s), ENT_QUOTES, 'UTF-8');
    $s = str_replace("\xC2\xA0", ' ', $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}

function parse_ordem_html($html) {
    $html = preg_replace('/<(script|style)\b.*?<\/\1>/si', '', (string)$html);
    if (!preg_match_all('/<h([2-5])\b[^>]*>(.*?)<\/h\1>/si', $html, $m, PREG_OFFSET_CAPTURE)) return array();

    $grupos = array();
    $n = count($m[0]);
    for ($i = 0; $i < $n; $i++) {
        $nome = limpar_texto($m[2][$i][0]);
        if ($nome === '' || mb_strlen_compat($nome) > 90) continue;
        $ini = $m[0][$i][1] + strlen($m[0][$i][0]);
        $fim = $i + 1 < $n ? $m[0][$i + 1][1] : strlen($html);
        $corpo = substr($html, $ini, $fim - $ini);

        $itens = array();
        // cartão padrão desses portais: <div class="cat-desc"> ... <h6>Título do item</h6>
        if (preg_match_all('/cat-desc.*?<h6[^>]*>(.*?)<\/h6>/si', $corpo, $mi)) {
            foreach ($mi[1] as $t) { $t = limpar_texto($t); if ($t !== '') $itens[] = $t; }
        }
        if (!$itens && preg_match_all('/<h6[^>]*>(.*?)<\/h6>/si', $corpo, $mi)) {
            foreach ($mi[1] as $k => $t) {
                $t = limpar_texto($t);
                // o primeiro h6 costuma ser o amparo legal do grupo, não um item
                if ($t !== '' && !($k === 0 && preg_match('/^(lei|decreto|portaria|pró-gestão|pro-gestao|órgãos|orgaos)/i', $t))) $itens[] = $t;
            }
        }
        if ($itens) $grupos[] = array('nome' => $nome, 'itens' => array_values(array_unique($itens)));
    }
    return $grupos;
}

function mb_strlen_compat($s) {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : preg_match_all('/./u', $s);
}

function buscar_ordem($url) {
    $ctx = stream_context_create(array('http' => array('timeout' => 12, 'ignore_errors' => true,
        'header' => "User-Agent: PortalTransparencia/1.0\r\n")));
    $html = @file_get_contents($url, false, $ctx);
    if ($html === false) return array();
    return parse_ordem_html($html);
}
