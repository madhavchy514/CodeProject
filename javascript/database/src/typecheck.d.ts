export type DataTypes = 'string'|'number'|'boolean'|'bigint'|'symbol'|'undefined'|'function'|'object'|
                 'primitive'|'scalar'|'null'|
                 'text'|'hex'|'alphanumeric'|'slug'|'uuid4'|
                 'posint'|'uint'|'posinf'|
                 'dict'|'array'|'error'|'json'|'buffer';

export declare const validatorMap: {
  [K in DataTypes]: (v: any) => boolean;
};

export declare function isOneOf(
  value: any,
  ...types: DataTypes[]
): boolean;

export declare function assertType(
  value: any,
  field: any,
  ...types: DataTypes[]
): void;