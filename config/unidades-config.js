const CONFIG_UNIDADES = {
    "Camioneta Granel": {
        tamano_unidad: "CHICA",
        prioridad: "NORMAL",
        carga: "Granel",
        tipo_operacion: "RECEPCION"
    },
    "Camioneta Palletizada": {
        tamano_unidad: "CHICA",
        prioridad: "NORMAL",
        carga: "Palletizado",
        tipo_operacion: "RECEPCION"
    },
    "Torthon Caja Seca": {
        tamano_unidad: "CHICA",
        prioridad: "NORMAL",
        carga: "Palletizado",
        tipo_operacion: "RECEPCION"
    },
    "Torthon Plataforma": {
        tamano_unidad: "CHICA",
        prioridad: "NORMAL",
        carga: "Palletizado",
        tipo_operacion: "RECEPCION"
    },
    "Trailer Plataforma": {
        tamano_unidad: "GRANDE",
        prioridad: "NORMAL",
        carga: "Palletizado",
        tipo_operacion: "RECEPCION"
    },
    "Trailer Caja Seca": {
        tamano_unidad: "GRANDE",
        prioridad: "NORMAL",
        carga: "Palletizado",
        tipo_operacion: "RECEPCION"
    },
    "Contenedor Granel": {
        tamano_unidad: "GRANDE",
        prioridad: "URGENTE",
        carga: "Granel",
        tipo_operacion: "RECEPCION"
    },
    "Contenedor Palletizado": {
        tamano_unidad: "GRANDE",
        prioridad: "URGENTE",
        carga: "Palletizado",
        tipo_operacion: "RECEPCION"
    }
};

function getUnitConfig(tipoUnidad) {
    return CONFIG_UNIDADES[tipoUnidad] || null;
}

function isValidUnitType(tipoUnidad) {
    return !!getUnitConfig(tipoUnidad);
}

function deriveUnitFields(tipoUnidad) {
    const config = getUnitConfig(tipoUnidad);
    if (!config) return null;

    return {
        carga: config.carga,
        tamano_unidad: config.tamano_unidad,
        prioridad: config.prioridad,
        tipo_operacion: config.tipo_operacion
    };
}

module.exports = {
    CONFIG_UNIDADES,
    getUnitConfig,
    isValidUnitType,
    deriveUnitFields
};