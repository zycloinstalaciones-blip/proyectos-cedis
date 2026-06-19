/* =========================================
ADMIN V4.7 - MODAL PRE ESTILO ENTRADAS
- sincroniza el botón inferior de cierre
- prioriza la pestaña Escáner como experiencia operativa
========================================= */

(function adminV47Init() {
  function syncFooterCloseButton() {
    const topBtn = document.getElementById('btnCerrarValidacionPre');
    const footerBtn = document.getElementById('btnCerrarValidacionPreEscaner');
    if (!topBtn || !footerBtn) return;
    const visible = getComputedStyle(topBtn).display !== 'none';
    footerBtn.style.display = visible ? 'inline-flex' : 'none';
  }

  function wireFooterCloseButton() {
    const footerBtn = document.getElementById('btnCerrarValidacionPreEscaner');
    if (!footerBtn || footerBtn.dataset.v47wired === '1') return;
    footerBtn.dataset.v47wired = '1';
    footerBtn.addEventListener('click', () => {
      if (typeof cerrarValidacionPreActual === 'function') {
        cerrarValidacionPreActual();
      }
    });
  }

  function focusScannerInputWhenActive() {
    const escanerPane = document.getElementById('preTabEscaner');
    const input = document.getElementById('scanPreInput');
    if (!escanerPane || !input) return;
    if (escanerPane.classList.contains('active') && !document.getElementById('bloqueEscaneoPre')?.classList.contains('hidden')) {
      setTimeout(() => input.focus(), 120);
    }
  }

  function wireTabFocus() {
    document.querySelectorAll('.pre-tab-btn').forEach(btn => {
      if (btn.dataset.v47focus === '1') return;
      btn.dataset.v47focus = '1';
      btn.addEventListener('click', () => {
        setTimeout(focusScannerInputWhenActive, 180);
      });
    });
  }

  function installObservers() {
    const target = document.getElementById('btnCerrarValidacionPre');
    if (!target || target.dataset.v47observer === '1') return;
    target.dataset.v47observer = '1';
    const observer = new MutationObserver(() => {
      syncFooterCloseButton();
      focusScannerInputWhenActive();
    });
    observer.observe(target, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  wireFooterCloseButton();
  wireTabFocus();
  installObservers();
  syncFooterCloseButton();
  focusScannerInputWhenActive();

  document.getElementById('modalPreTurno')?.addEventListener('click', () => {
    setTimeout(() => {
      syncFooterCloseButton();
      focusScannerInputWhenActive();
    }, 180);
  });

  console.info('Admin PRE V4.7 estilo entradas cargado');
})();
