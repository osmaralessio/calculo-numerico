/*
 * Moldura dos aplicativos GeoGebra do livro (adaptada da versão Streamlit).
 *
 * Computador: o aplicativo é reduzido para caber na largura (e, na página inteira,
 * também na altura).
 * Celular: o aplicativo abre em 70% do tamanho original (ou no último zoom usado),
 * dentro de uma moldura que rola, com a barra:
 *   ✋ Rolar  – liga um "véu": um dedo rola a moldura; desligado, o toque vai para o GeoGebra
 *   − 70% +   – zoom (o que já foi digitado no aplicativo é mantido)
 *   ⛶         – tela cheia (no Android, gira para a horizontal)
 * Dois dedos sempre rolam a moldura.
 *
 * Uso: MolduraGGB.montar(elemento, { arquivo: 'url do .ggb', W: 1366, H: 720, pagina: false })
 */
(function () {
  var ESCALA_CELULAR = 0.70;
  var ZOOMS = [0.5, 0.7, 0.85, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
  var LIMITE = 700, LIMITE_TOQUE = 900;
  var contador = 0;

  var CSS = '' +
    '.mggb-raiz{font-family:Inter,system-ui,sans-serif}' +
    '.mggb-raiz:fullscreen{background:#fff;overflow:auto;padding:4px}' +
    '.mggb-barra{display:none;flex-wrap:wrap;align-items:center;gap:6px;padding:0 2px 6px;font-size:14px;color:#1f2328}' +
    '.mggb-barra button{min-width:40px;height:40px;font-size:17px;border:1px solid #c9c4b5;padding:0 6px;border-radius:10px;background:#f3f1ea;color:#143c96;touch-action:manipulation;cursor:pointer}' +
    '.mggb-barra button:disabled{opacity:.4}' +
    '.mggb-zoom{min-width:40px;text-align:center;font-size:13px;color:#555}' +
    '.mggb-tela{margin-left:auto;display:flex;align-items:center;justify-content:center}' +
    '.mggb-rolar{font-size:15px!important;padding:0 10px!important}' +
    '.mggb-rolar.ativo{background:#143c96!important;color:#fff!important;border-color:#143c96!important}' +
    '.mggb-dica{font-size:11.5px;color:#666;line-height:1.1;max-width:84px}' +
    '.mggb-moldura{position:relative;overflow:hidden;background:#fff}' +
    '.mggb-moldura.celular{overflow:auto;-webkit-overflow-scrolling:touch}' +
    '.mggb-veu{display:none;position:absolute;left:0;top:0;z-index:50;background:rgba(20,60,150,0.04);touch-action:none}' +
    '.mggb-veu.ativo{display:block}' +
    '.mggb-aviso{display:none;color:#7a4b00;background:#fff4dc;padding:12px;border-radius:8px;margin:0}';

  function estilo() {
    if (document.getElementById('mggb-css')) return;
    var s = document.createElement('style'); s.id = 'mggb-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var promessa = null;
  function carregarGeoGebra() {
    if (window.GGBApplet) return Promise.resolve();
    if (promessa) return promessa;
    promessa = new Promise(function (ok, erro) {
      var s = document.createElement('script');
      s.src = 'https://www.geogebra.org/apps/deployggb.js';
      s.onload = function () { ok(); };
      s.onerror = function () { promessa = null; erro(new Error('falha')); };
      document.head.appendChild(s);
    });
    return promessa;
  }

  function ehCelular() {
    var larg = window.innerWidth;
    var toque = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return larg < LIMITE || (toque && larg < LIMITE_TOQUE);
  }

  function lerZoom() {
    var z = ESCALA_CELULAR;
    try { var g = parseFloat(localStorage.getItem('ggbZoomCelular')); if (g) z = g; } catch (e) {}
    return Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], z));
  }
  function guardarZoom(z) { try { localStorage.setItem('ggbZoomCelular', z); } catch (e) {} }

  function montar(raiz, op) {
    estilo();
    var W = op.W || 1366, H = op.H || 720, pagina = !!op.pagina;
    raiz.classList.add('mggb-raiz');
    raiz.innerHTML =
      '<div class="mggb-barra">' +
        '<button type="button" class="mggb-rolar" aria-pressed="false" title="Ligado: um dedo rola o aplicativo. Desligado: um dedo usa o aplicativo.">✋ Rolar</button>' +
        '<span class="mggb-dica">2 dedos também rolam</span>' +
        '<button type="button" class="mggb-menos" aria-label="Diminuir" title="Diminuir o aplicativo">−</button>' +
        '<span class="mggb-zoom">70%</span>' +
        '<button type="button" class="mggb-mais" aria-label="Aumentar" title="Aumentar o aplicativo">+</button>' +
        '<button type="button" class="mggb-tela" aria-label="Tela cheia" title="Tela cheia"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#143c96" stroke-width="2.4" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' +
      '</div>' +
      '<div class="mggb-moldura"><div class="mggb-ggb"></div><div class="mggb-veu"></div></div>' +
      '<p class="mggb-aviso">Não foi possível carregar o GeoGebra (é preciso conexão com a internet e acesso a geogebra.org). ' +
      'Use o link <b>Baixar .ggb</b> e abra o arquivo no GeoGebra Classic.</p>';

    var barra = raiz.querySelector('.mggb-barra');
    var mold = raiz.querySelector('.mggb-moldura');
    var caixa = raiz.querySelector('.mggb-ggb');
    var veu = raiz.querySelector('.mggb-veu');
    var aviso = raiz.querySelector('.mggb-aviso');
    var CELULAR = false, API = null, ocupado = false;

    var P = {
      appName: 'classic', width: W, height: H, filename: op.arquivo,
      showToolBar: false, showMenuBar: false, showAlgebraInput: false,
      showResetIcon: true, enableRightClick: false, enableShiftDragZoom: true,
      showFullscreenButton: false, language: 'pt', borderColor: '#FFFFFF',
      appletOnLoad: function (api) { API = api; ocupado = false; if (op.carregou) op.carregou(); }
    };

    function alturaVisivel() {
      var topo = pagina ? (op.topo ? op.topo() : 0) : 90;
      var b = CELULAR ? (barra.offsetHeight || 50) : 0;
      return Math.max(240, window.innerHeight - topo - b - 8);
    }

    function dimensionar(s) {
      if (CELULAR) {
        var altApp = Math.min(Math.ceil(H * s) + 4, alturaVisivel());
        mold.style.height = altApp + 'px';
        caixa.style.width = Math.ceil(W * s) + 'px';
        veu.style.width = Math.ceil(W * s) + 'px';
        veu.style.height = Math.ceil(H * s) + 'px';
        raiz.querySelector('.mggb-zoom').textContent = Math.round(s * 100) + '%';
        raiz.querySelector('.mggb-menos').disabled = s <= ZOOMS[0] + 1e-9;
        raiz.querySelector('.mggb-mais').disabled = s >= ZOOMS[ZOOMS.length - 1] - 1e-9;
      } else {
        mold.style.height = Math.ceil(H * s) + 'px';
        mold.style.width = Math.ceil(W * s) + 'px';
        mold.style.margin = pagina ? '0 auto' : '0';
      }
    }

    function injetar() {
      contador += 1;
      var id = 'mggb' + contador;
      if (CELULAR) {
        var cw = Math.ceil(W * P.scale), ch = Math.ceil(H * P.scale);
        caixa.innerHTML = '<div class="mggb-caixa' + contador + '" style="width:' + cw + 'px;height:' + ch + 'px"><div id="' + id + '"></div></div>';
        P.scaleContainerClass = 'mggb-caixa' + contador;
        P.autoHeight = false;
        P.allowUpscale = true;
      } else {
        caixa.innerHTML = '<div id="' + id + '"></div>';
        P.allowUpscale = P.scale > 1;
      }
      new window.GGBApplet(P, true).inject(id);
    }

    // Troca o zoom guardando o que já foi digitado no aplicativo.
    function mudarZoom(sentido) {
      if (ocupado) return;
      var atual = P.scale, novo = atual;
      for (var i = 0; i < ZOOMS.length; i++) {
        if (sentido > 0 && ZOOMS[i] > atual + 1e-9) { novo = ZOOMS[i]; break; }
        if (sentido < 0 && ZOOMS[i] < atual - 1e-9) novo = ZOOMS[i];
      }
      if (novo === atual) return;
      var fx = mold.scrollLeft / Math.max(1, mold.scrollWidth), fy = mold.scrollTop / Math.max(1, mold.scrollHeight);
      var refazer = function () {
        P.scale = novo; guardarZoom(novo); dimensionar(novo); injetar();
        setTimeout(function () { mold.scrollLeft = fx * mold.scrollWidth; mold.scrollTop = fy * mold.scrollHeight; }, 400);
      };
      ocupado = true;
      setTimeout(function () { ocupado = false; }, 8000);
      try {
        if (API && API.getBase64) {
          API.getBase64(function (b64) { if (b64) { P.ggbBase64 = b64; delete P.filename; } refazer(); });
          return;
        }
      } catch (e) {}
      refazer();
    }

    // Dois dedos arrastando sobre o aplicativo rolam a moldura (o GeoGebra não recebe esse gesto).
    function ativarDoisDedos() {
      var ativo = false, x0 = 0, y0 = 0, sl = 0, st = 0;
      function meio(ev) {
        var a = ev.touches[0], b = ev.touches[1];
        return [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2];
      }
      mold.addEventListener('touchstart', function (ev) {
        if (ev.touches.length >= 2) {
          ativo = true; var m = meio(ev); x0 = m[0]; y0 = m[1]; sl = mold.scrollLeft; st = mold.scrollTop;
          ev.stopPropagation(); ev.preventDefault();
        }
      }, { capture: true, passive: false });
      mold.addEventListener('touchmove', function (ev) {
        if (ativo && ev.touches.length >= 2) {
          var m = meio(ev);
          mold.scrollLeft = sl - (m[0] - x0);
          mold.scrollTop = st - (m[1] - y0);
          ev.stopPropagation(); ev.preventDefault();
        }
      }, { capture: true, passive: false });
      var fim = function (ev) { if (ativo) { if (ev.touches.length === 0) ativo = false; ev.stopPropagation(); } };
      mold.addEventListener('touchend', fim, { capture: true });
      mold.addEventListener('touchcancel', fim, { capture: true });
      ['pointermove', 'pointerdown'].forEach(function (tipo) {
        mold.addEventListener(tipo, function (ev) { if (ativo && ev.pointerType === 'touch') ev.stopPropagation(); }, { capture: true });
      });
    }

    // Com o véu ligado, um dedo arrasta a moldura (com um pouco de inércia ao soltar).
    function ativarUmDedo() {
      var x = 0, y = 0, vx = 0, vy = 0, t = 0, anim = null;
      veu.addEventListener('touchstart', function (ev) {
        if (anim) cancelAnimationFrame(anim);
        var p = ev.touches[0]; x = p.clientX; y = p.clientY; vx = vy = 0; t = Date.now();
        ev.preventDefault();
      }, { passive: false });
      veu.addEventListener('touchmove', function (ev) {
        if (ev.touches.length !== 1) return;
        var p = ev.touches[0], dx = p.clientX - x, dy = p.clientY - y, agora = Date.now(), dt = Math.max(1, agora - t);
        mold.scrollLeft -= dx; mold.scrollTop -= dy;
        vx = 0.8 * (dx / dt) + 0.2 * vx; vy = 0.8 * (dy / dt) + 0.2 * vy;
        x = p.clientX; y = p.clientY; t = agora;
        ev.preventDefault();
      }, { passive: false });
      veu.addEventListener('touchend', function () {
        var ult = Date.now();
        function passo() {
          var agora = Date.now(), dt = agora - ult; ult = agora;
          vx *= 0.94; vy *= 0.94;
          mold.scrollLeft -= vx * dt; mold.scrollTop -= vy * dt;
          if (Math.abs(vx) > 0.02 || Math.abs(vy) > 0.02) anim = requestAnimationFrame(passo);
        }
        if (Date.now() - t < 80) anim = requestAnimationFrame(passo);
      });
    }

    function telaCheia() {
      var f = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
      if (!f) return;
      try {
        var r = f.call(raiz);
        if (r && r.then) r.then(function () {
          try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
        }).catch(function () {});
      } catch (e) {}
    }

    function modoCelular() {
      barra.style.display = 'flex';
      mold.classList.add('celular');
      var s = lerZoom();
      var bt = raiz.querySelector('.mggb-rolar');
      bt.onclick = function () {
        var on = !veu.classList.contains('ativo');
        veu.classList.toggle('ativo', on);
        bt.classList.toggle('ativo', on);
        bt.setAttribute('aria-pressed', on ? 'true' : 'false');
        bt.textContent = on ? '✋ Rolando' : '✋ Rolar';
      };
      ativarDoisDedos();
      ativarUmDedo();
      raiz.querySelector('.mggb-menos').onclick = function () { mudarZoom(-1); };
      raiz.querySelector('.mggb-mais').onclick = function () { mudarZoom(1); };
      var podeTela = false;
      try { podeTela = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); } catch (e) {}
      if (podeTela) raiz.querySelector('.mggb-tela').onclick = telaCheia;
      else raiz.querySelector('.mggb-tela').style.display = 'none';
      P.enableShiftDragZoom = false;  // no toque, arrastar não move a janela gráfica por engano
      P.disableAutoScale = true;      // sem isto o GeoGebra se encolhe até caber na tela e ignora o zoom
      return s;
    }

    function escalaComputador() {
      var larg = raiz.clientWidth || window.innerWidth;
      if (pagina) {
        var alt = window.innerHeight - (op.topo ? op.topo() : 0) - 4;
        return Math.min(larg / W, alt / H);
      }
      return Math.min(1, larg / W);
    }

    // Em tela cheia (ou ao girar o celular) a moldura ganha a nova altura disponível.
    function aoMudarTela() { if (CELULAR) dimensionar(P.scale); }
    document.addEventListener('fullscreenchange', function () { setTimeout(aoMudarTela, 200); });
    window.addEventListener('orientationchange', function () { setTimeout(aoMudarTela, 400); });

    carregarGeoGebra().then(function () {
      if (ehCelular()) {
        CELULAR = true;
        P.scale = modoCelular();
      } else {
        P.scale = escalaComputador();
      }
      dimensionar(P.scale);
      injetar();
    }).catch(function () {
      mold.style.display = 'none';
      aviso.style.display = 'block';
    });
  }

  window.MolduraGGB = { montar: montar, ehCelular: ehCelular };
})();
