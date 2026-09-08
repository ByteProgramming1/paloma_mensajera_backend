import { ValidationError } from 'class-validator';

// Traduce los mensajes que class-validator genera por defecto (siempre en
// ingles, ej. "password must be longer than or equal to 1 characters") al
// español, sin tener que agregar `{ message: '...' }` a cada decorador de
// cada DTO uno por uno. Cubre exactamente los decoradores que ya usa el
// proyecto (ver `grep -rhoE "@Is[A-Za-z]+|@Min...|@ArrayNotEmpty..."` sobre
// src/**/*.dto.ts) - un decorador nuevo que no este aqui simplemente deja el
// mensaje en ingles tal cual, no rompe nada.
//
// Cada entrada valida que el mensaje sea EXACTAMENTE el default sin tocar de
// class-validator (comparando contra el texto fijo de su plantilla) antes de
// traducir: si un DTO ya trae un `{ message: '...' }` propio (ej. el slug de
// roles), ese texto NO calza con el default y se deja pasar intacto en vez de
// pisarlo con una traduccion generica.
interface ConstraintTranslator {
  matchesDefault: (message: string, property: string) => boolean;
  translate: (property: string, message: string) => string;
}

const NUMBER_PATTERN = /(-?\d+(?:\.\d+)?)/;

function extractNumber(message: string): string {
  return message.match(NUMBER_PATTERN)?.[1] ?? '';
}

function extractAllowedValues(message: string): string {
  const marker = 'following values: ';
  const index = message.indexOf(marker);
  return index === -1 ? message : message.slice(index + marker.length);
}

const TRANSLATORS: Record<string, ConstraintTranslator> = {
  isNotEmpty: {
    matchesDefault: (message, property) => message === `${property} should not be empty`,
    translate: (property) => `${property} no debe estar vacio`,
  },
  arrayNotEmpty: {
    matchesDefault: (message, property) => message === `${property} should not be empty`,
    translate: (property) => `${property} no debe estar vacio`,
  },
  isString: {
    matchesDefault: (message, property) => message === `${property} must be a string`,
    translate: (property) => `${property} debe ser un texto`,
  },
  isEmail: {
    matchesDefault: (message, property) => message === `${property} must be an email`,
    translate: (property) => `${property} debe ser un correo valido`,
  },
  isBoolean: {
    matchesDefault: (message, property) => message === `${property} must be a boolean value`,
    translate: (property) => `${property} debe ser verdadero o falso`,
  },
  isInt: {
    matchesDefault: (message, property) => message === `${property} must be an integer number`,
    translate: (property) => `${property} debe ser un numero entero`,
  },
  isNumber: {
    matchesDefault: (message, property) =>
      message === `${property} must be a number conforming to the specified constraints`,
    translate: (property) => `${property} debe ser un numero`,
  },
  isArray: {
    matchesDefault: (message, property) => message === `${property} must be an array`,
    translate: (property) => `${property} debe ser una lista`,
  },
  isUuid: {
    matchesDefault: (message, property) => message === `${property} must be a UUID`,
    translate: (property) => `${property} debe ser un identificador (UUID) valido`,
  },
  isUrl: {
    matchesDefault: (message, property) => message === `${property} must be a URL address`,
    translate: (property) => `${property} debe ser una URL valida`,
  },
  isDateString: {
    matchesDefault: (message, property) =>
      message === `${property} must be a valid ISO 8601 date string`,
    translate: (property) => `${property} debe ser una fecha valida (ISO 8601)`,
  },
  minLength: {
    matchesDefault: (message) =>
      message.includes('must be longer than or equal to') && message.includes('characters'),
    translate: (property, message) =>
      `${property} debe tener al menos ${extractNumber(message)} caracteres`,
  },
  min: {
    matchesDefault: (message) => message.includes('must not be less than'),
    translate: (property, message) =>
      `${property} no puede ser menor que ${extractNumber(message)}`,
  },
  isIn: {
    matchesDefault: (message) => message.includes('must be one of the following values:'),
    translate: (property, message) =>
      `${property} debe ser uno de los siguientes valores: ${extractAllowedValues(message)}`,
  },
  matches: {
    matchesDefault: (message) =>
      message.includes('must match') && message.includes('regular expression'),
    translate: (property) => `El formato de ${property} no es valido`,
  },
  whitelistValidation: {
    matchesDefault: (message, property) => message === `property ${property} should not exist`,
    translate: (property) => `${property} no es un campo permitido`,
  },
};

function translateOne(property: string, key: string, message: string): string {
  const translator = TRANSLATORS[key];
  if (!translator || !translator.matchesDefault(message, property)) {
    return message;
  }
  return translator.translate(property, message);
}

// Recorre errores anidados (ej. CreateOrderDto.cartItems con @ValidateNested)
// igual que el flattening por defecto de Nest, pero usa la ruta completa con
// puntos (ej. "cartItems.0.productId") como nombre de propiedad en vez de
// pegarsela al mensaje ya traducido.
export function translateValidationErrors(
  errors: ValidationError[],
  parentPath?: string,
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const propertyPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      for (const [key, message] of Object.entries(error.constraints)) {
        messages.push(translateOne(propertyPath, key, message));
      }
    }
    if (error.children && error.children.length > 0) {
      messages.push(...translateValidationErrors(error.children, propertyPath));
    }
  }
  return messages;
}
