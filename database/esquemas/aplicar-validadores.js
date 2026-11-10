// Validadores $jsonSchema para las colecciones principales (segunda línea de defensa,
// además de los esquemas de Mongoose). Ejecutar con:
//   mongosh "mongodb+srv://..." database/esquemas/aplicar-validadores.js

const validadores = {
  usuarios: {
    bsonType: 'object',
    required: ['nombre', 'apellido', 'email', 'passwordHash', 'rol', 'activo'],
    properties: {
      nombre: { bsonType: 'string', minLength: 2, maxLength: 60 },
      apellido: { bsonType: 'string', minLength: 2, maxLength: 60 },
      email: { bsonType: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
      passwordHash: { bsonType: 'string', pattern: '^\\$2[aby]\\$' },
      rol: { enum: ['admin', 'colaborador'] },
      activo: { bsonType: 'bool' },
      intentosFallidos: { bsonType: ['int', 'long', 'double'], minimum: 0 }
    }
  },
  activos: {
    bsonType: 'object',
    required: ['codigo', 'nombre', 'tipo', 'criticidad'],
    properties: {
      codigo: { bsonType: 'string', pattern: '^[A-Z0-9_-]{2,20}$' },
      tipo: { enum: ['aplicacion', 'servidor', 'red', 'base_datos', 'endpoint', 'nube'] },
      criticidad: { enum: ['baja', 'media', 'alta', 'critica'] }
    }
  },
  incidentes: {
    bsonType: 'object',
    required: ['folio', 'titulo', 'descripcion', 'categoria', 'severidad', 'estado', 'reportadoPor', 'fechaDeteccion'],
    properties: {
      categoria: { enum: ['phishing', 'malware', 'acceso_no_autorizado', 'perdida_equipo', 'fuga_datos', 'suplantacion', 'otro'] },
      severidad: { enum: ['baja', 'media', 'alta', 'critica'] },
      estado: { enum: ['abierto', 'en_analisis', 'resuelto', 'cerrado'] },
      reportadoPor: { bsonType: 'objectId' },
      historial: { bsonType: 'array' }
    }
  },
  solicitudes_acceso: {
    bsonType: 'object',
    required: ['solicitante', 'activo', 'nivelAcceso', 'justificacion', 'estado'],
    properties: {
      solicitante: { bsonType: 'objectId' },
      activo: { bsonType: 'objectId' },
      nivelAcceso: { enum: ['lectura', 'escritura', 'administrador'] },
      estado: { enum: ['pendiente', 'aprobada', 'rechazada'] }
    }
  },
  tokens_recuperacion: {
    bsonType: 'object',
    required: ['usuario', 'tokenHash', 'expiraEn'],
    properties: { tokenHash: { bsonType: 'string', minLength: 64, maxLength: 64 } }
  }
};

for (const [coleccion, esquema] of Object.entries(validadores)) {
  db.runCommand({ collMod: coleccion, validator: { $jsonSchema: esquema }, validationLevel: 'moderate', validationAction: 'error' });
  print(`Validador aplicado a ${coleccion}`);
}
