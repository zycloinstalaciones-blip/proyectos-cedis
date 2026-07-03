(function () {
    let CONFIG_UNIDADES = {
        "Camioneta Granel": {
            tamano_unidad: "CHICA",
            prioridad: "NORMAL",
            carga: "Granel"
        },
        "Camioneta Palletizada": {
            tamano_unidad: "CHICA",
            prioridad: "NORMAL",
            carga: "Palletizado"
        },
        "Torthon Caja Seca": {
            tamano_unidad: "CHICA",
            prioridad: "NORMAL",
            carga: "Palletizado"
        },
        "Torthon Plataforma": {
            tamano_unidad: "CHICA",
            prioridad: "NORMAL",
            carga: "Palletizado"
        },
        "Trailer Plataforma": {
            tamano_unidad: "GRANDE",
            prioridad: "NORMAL",
            carga: "Palletizado"
        },
        "Trailer Caja Seca": {
            tamano_unidad: "GRANDE",
            prioridad: "NORMAL",
            carga: "Palletizado"
        },
        "Contenedor Granel": {
            tamano_unidad: "GRANDE",
            prioridad: "URGENTE",
            carga: "Granel"
        },
        "Contenedor Palletizado": {
            tamano_unidad: "GRANDE",
            prioridad: "URGENTE",
            carga: "Palletizado"
        }
    };

    const MAPA_CATEGORIAS = {
        PISO: ['Pisos y Adhesivos'],
        BAÑO: ['Sanitarios/Tocadores/Muebles/Calentadores/Tinacos'],
        GRIFERIA: ['Griferia/Decorados/Vaguetas'],
        GENERAL: ['Carga General / Mixta']
    };

    let cacheFabricantes = null;
    let promesaFabricantes = null;

    fetch('/api/config/unidades')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            CONFIG_UNIDADES = data;
            if (window.AzUtils) window.AzUtils.CONFIG_UNIDADES = data;
        }
    })
    .catch(() => {});

    function getUnitConfig(tipoUnidad) {
        return CONFIG_UNIDADES[tipoUnidad] || null;
    }

    function applyUnitConfig({
        tipoUnidadSelector = '#tipo_unidad',
        cargaSelector = '#carga'
    } = {}) {
        const selectTipoUnidad = document.querySelector(tipoUnidadSelector);
        const selectCarga = document.querySelector(cargaSelector);

        if (!selectTipoUnidad || !selectCarga) return null;

        const tipoUnidad = selectTipoUnidad.value;
        const config = getUnitConfig(tipoUnidad);

        if (!config) {
            selectCarga.value = '';
            return null;
        }

        selectCarga.value = config.carga;
        return config;
    }

    function getCategoryGroups(categoria) {
        return MAPA_CATEGORIAS[categoria] || [];
    }

    async function loadFabricantes() {
        if (Array.isArray(cacheFabricantes)) {
            return cacheFabricantes;
        }

        const cacheSession = sessionStorage.getItem('fabricantes_cache');
        if (cacheSession) {
            try {
                cacheFabricantes = JSON.parse(cacheSession);
                if (Array.isArray(cacheFabricantes)) {
                    return cacheFabricantes;
                }
            } catch (e) {
                console.warn("No se pudo leer cache de fabricantes desde sessionStorage.");
            }
        }

        if (!promesaFabricantes) {
            promesaFabricantes = fetch('/api/fabricantes')
                .then(res => {
                    if (!res.ok) throw new Error('No se pudieron cargar fabricantes');
                    return res.json();
                })
                .then(data => {
                    cacheFabricantes = Array.isArray(data) ? data : [];
                    sessionStorage.setItem('fabricantes_cache', JSON.stringify(cacheFabricantes));
                    return cacheFabricantes;
                })
                .catch(error => {
                    console.error("Error al cargar fabricantes:", error);
                    return [];
                })
                .finally(() => {
                    promesaFabricantes = null;
                });
        }

        return promesaFabricantes;
    }

    async function fillProveedorSelect({
        categoriaSelector = '#categoria',
        proveedorSelector = '#proveedor',
        preserveValue = ''
    } = {}) {
        const selectCategoria = document.querySelector(categoriaSelector);
        const selectProveedor = document.querySelector(proveedorSelector);

        if (!selectCategoria || !selectProveedor) return [];

        const categoria = selectCategoria.value;
        const grupos = getCategoryGroups(categoria);

        selectProveedor.innerHTML = '<option value="">Selecciona un Proveedor...</option>';

        if (!categoria || grupos.length === 0) {
            return [];
        }

        const fabricantes = await loadFabricantes();

        const filtrados = fabricantes.filter(f => {
            const grupoTexto = String(f.grupo || '');
            return grupos.some(grupo => grupoTexto.includes(grupo));
        });

        filtrados.forEach(f => {
            const option = document.createElement('option');
            option.value = f.nombreComercial;
            option.textContent = f.nombreComercial;
            selectProveedor.appendChild(option);
        });

        if (preserveValue) {
            const existe = Array.from(selectProveedor.options).some(opt => opt.value === preserveValue);
            if (existe) {
                selectProveedor.value = preserveValue;
            }
        }

        return filtrados;
    }

    window.AzUtils = {
        CONFIG_UNIDADES,
        MAPA_CATEGORIAS,
        getUnitConfig,
        applyUnitConfig,
        getCategoryGroups,
        loadFabricantes,
        fillProveedorSelect
    };
})();
