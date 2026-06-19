/* ===============================================================
ADMIN V4.8 CORREGIDO - TARJETAS DE PATIO/HISTORIAL
Correcciones de sintaxis:
- Regex de split correctamente cerrado
- Template literals correctamente cerrados
- Render de entradas/facturas asignadas estable
- En En Descarga, reemplaza "Ver" por "PRE" que abre el modal
=============================================================== */

(function adminV48CardsPatch() {
  function normalizarListaTexto(valor) {
    if (Array.isArray(valor)) {
      return valor.map(v => String(v || '').trim()).filter(Boolean);
    }

    if (valor == null) return [];

    if (typeof valor === 'object') {
      const posibles = ['folio', 'factura', 'entrada', 'pre_entrada', 'numero', 'referencia'];
      const encontrados = posibles
        .map(k => valor[k])
        .filter(Boolean)
        .map(v => String(v).trim())
        .filter(Boolean);
      return encontrados;
    }

    const str = String(valor).trim();
    if (!str) return [];

    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str);
        return normalizarListaTexto(parsed);
      } catch (e) {
        // si no es JSON válido, continúa con split normal
      }
    }

    return str
      .split(/[;,|\n]+/)
      .map(v => String(v || '').trim())
      .filter(Boolean);
  }

  function obtenerEntradasAsignadas(turno) {
    const candidatos = [
      turno?.entradas_asignadas,
      turno?.entradasAsignadas,
      turno?.facturas_asignadas,
      turno?.facturasAsignadas,
      turno?.folios_asignados,
      turno?.foliosAsignados,
      turno?.facturas,
      turno?.entradas,
      turno?.pre_entradas,
      turno?.preEntradas,
      turno?.folios,
      turno?.folio
    ];

    for (const candidato of candidatos) {
      const lista = normalizarListaTexto(candidato);
      if (lista.length) return lista;
    }

    return [];
  }

  function renderEntradasAsignadas(turno) {
    const entradas = obtenerEntradasAsignadas(turno);
    const total = entradas.length;

    if (total <= 0) {
      return {
        label: 'Folio:',
        html: '<span>-</span>'
      };
    }

    if (total === 1) {
      return {
        label: 'Folio:',
        html: `<span>${escaparHTML(entradas[0])}</span>`
      };
    }

    const tooltip = escaparHTML(entradas.join('\n'));
    return {
      label: 'Folio:',
      html: `<div class="tooltip-folios" data-folios="${tooltip}">(${total}) <span class="icono-ayuda">?</span></div>`
    };
  }

  function renderizarPatioV48() {
    const contenedor = document.getElementById('tab-patio');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    let turnosFiltrados = [...listaTurnosLocal];
    turnosFiltrados.sort((a, b) => {
      const aTieneAnden = !!a.anden;
      const bTieneAnden = !!b.anden;

      if (aTieneAnden && !bTieneAnden) return -1;
      if (!aTieneAnden && bTieneAnden) return 1;

      if (aTieneAnden && bTieneAnden) {
        const andenA = parseInt(a.anden, 10) || 999;
        const andenB = parseInt(b.anden, 10) || 999;
        if (andenA !== andenB) return andenA - andenB;
        if (a.estatus === 'En Descarga' && b.estatus !== 'En Descarga') return -1;
        if (b.estatus === 'En Descarga' && a.estatus !== 'En Descarga') return 1;
      }

      if (a.prioridad === 'URGENTE' && b.prioridad !== 'URGENTE') return -1;
      if (b.prioridad === 'URGENTE' && a.prioridad !== 'URGENTE') return 1;

      const parsedA = obtenerFechaSegura(obtenerFechaVisibleAdmin(a));
      const parsedB = obtenerFechaSegura(obtenerFechaVisibleAdmin(b));
      if (!parsedA && !parsedB) return 0;
      if (!parsedA) return 1;
      if (!parsedB) return -1;
      return parsedA - parsedB;
    });

    const countPatio = document.getElementById('countPatio');
    if (countPatio) countPatio.innerText = turnosFiltrados.length;

    const idsActuales = new Set(turnosFiltrados.map(t => t.id));

    turnosFiltrados.forEach(t => {
      const esNuevo = !idsPrevios.has(t.id);
      const nivelAlerta = typeof obtenerNivelAlerta === 'function' ? obtenerNivelAlerta(t) : null;
      const statusVisual = window.AzStatus.getStatusVisual(t.estatus, t);
      const visualCategoria = window.AzUI.getCategoryVisual(t.categoria);
      const nombreCategoria = visualCategoria.nombreTarjeta || visualCategoria.nombre;
      const iconoUnidad = t.tipo_unidad && t.tipo_unidad.toLowerCase().includes('camioneta') ? '🚚' : '🚛';
      const esUrgente = t.prioridad === 'URGENTE';

      const entradasUI = renderEntradasAsignadas(t);

      let accionPrincipalHTML = '';
      let botonPreHTML = `<button class="btn-action-neutral" onclick="abrirModalPreTurno(${t.id})">📄 PRE</button>`;

      if (typeof puedeLlamarAAnden === 'function' && puedeLlamarAAnden(t)) {
        accionPrincipalHTML = `<button class="btn-action-primary" onclick="llamarUnidad(${t.id})">🔔 Llamar a Andén</button>`;
      } else if (typeof puedeIniciarDescarga === 'function' && puedeIniciarDescarga(t)) {
        accionPrincipalHTML = `<button class="btn-action-success" onclick="iniciarDescarga(${t.id})">▶ Iniciar Descarga</button>`;
      } else if (typeof estaEnDescarga === 'function' && estaEnDescarga(t)) {
        accionPrincipalHTML = `
          <div class="acciones-grid">
            <button class="btn-action-info" onclick="abrirModalPreTurno(${t.id})">📄 PRE</button>
            <button class="btn-action-warning" onclick="llamarSiguiente()">🔔 Sig</button>
            <button class="btn-action-danger" onclick="finalizarTurno(${t.id})">Finalizar</button>
          </div>`;
        botonPreHTML = '';
      }

      contenedor.innerHTML += `
        <div class="card-admin card-entrega ${statusVisual.classEstado} ${nivelAlerta ? 'alerta-' + nivelAlerta : ''} ${esNuevo ? 'nueva-unidad' : ''}" data-id="${t.id}" draggable="true" style="--color-card:${escaparHTML(visualCategoria.color)};">
          ${esUrgente ? `<div class="urgente-bar">🚨 UNIDAD URGENTE</div>` : ''}
          <div class="card-admin-top">
            <div class="icono-box">${iconoUnidad}</div>
            <span class="badge ${escaparHTML(statusVisual.badgeClass)}">${escaparHTML(statusVisual.badgeText)}</span>
            <span class="timer-chip">⏱ ${escaparHTML(obtenerMinutosEspera(t))}</span>
          </div>
          <div class="card-admin-body">
            <div class="titulo-operador">${escaparHTML(t.nombre_operador || 'Sin nombre')}</div>
            <div class="datos-lista">
              <div class="linea-dato"><span class="dato-icono">${escaparHTML(visualCategoria.icono)}</span><b>Área:</b><span class="valor-area">${escaparHTML(nombreCategoria || '-')}</span></div>
              <div class="linea-dato"><span class="dato-icono">📄</span><b>${escaparHTML(entradasUI.label)}</b>${entradasUI.html}</div>
              <div class="linea-dato"><span class="dato-icono">🚚</span><b>Unidad:</b><span>${escaparHTML(t.tipo_unidad || '-')} ${t.placas ? `(${escaparHTML(t.placas)})` : ''}</span></div>
              <div class="linea-dato"><span class="dato-icono">🏢</span><b>Proveedor:</b><span>${escaparHTML(t.proveedor || '-')}</span></div>
              <div class="linea-dato entrega"><span class="dato-icono">📦</span><b>Entrega:</b><span>${escaparHTML(t.cantidad || '0')}</span></div>
              <div class="linea-dato"><span class="dato-icono">📞</span><b>Tel:</b><span>${escaparHTML(t.telefono || '-')}</span></div>
              <div class="linea-dato"><span class="dato-icono">📅</span><b>Cita/Llegada:</b><span>${escaparHTML(obtenerFechaVisibleAdmin(t) || '-')}</span></div>
              ${t.hora_inicio_descarga ? `<div class="linea-dato inicio"><span class="dato-icono">🕒</span><b>Inicio:</b><span>${escaparHTML(t.hora_inicio_descarga)}</span></div>` : ''}
            </div>
          </div>
          <div class="card-admin-footer">${accionPrincipalHTML}${botonPreHTML}</div>
        </div>`;
    });

    idsPrevios = idsActuales;
  }

  // Expone helpers por si quieres depurar en consola
  window.obtenerEntradasAsignadasTurno = obtenerEntradasAsignadas;
  window.renderEntradasAsignadasTurno = renderEntradasAsignadas;

  // Override del render principal de patio
  window.renderizarPatio = renderizarPatioV48;

  // Refresca una vez cargado el override
  setTimeout(() => {
    try {
      renderizarPatioV48();
    } catch (e) {
      console.error('No se pudo refrescar renderizarPatio V4.8 corregido:', e);
    }
  }, 150);

  console.info('Admin V4.8 corregido cargado');
})();
