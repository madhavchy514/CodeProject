export type JsonValue = string|boolean|number|null|JsonValue[]|{ [x: string]: JsonValue };

export type ReadOptions = {
  limit?: number;
  offset?: number;
  asc?: boolean;
  batch?: number;
};

export declare class Mapbase {
  constructor(mbDir: string, table: string, chunkSize?: number);
  create(key: string, id: string): Promise<string>;
  delete(key: string, id: string): Promise<void>;
  deleteKey(key: string): Promise<void>;
  read(key: string, opts?: ReadOptions): Promise<string[]>;
  hasKey(key: string): Promise<boolean>;
  hasId(key: string): Promise<boolean>;
  static readonly ERROR_CODES: {
    ID_FOUND: 'create() failed because the Id already exists',
    CREATE_FAILED: 'create() failed due to some reason',
    ID_NOT_FOUND: 'delete() could not find the Id',
    DELETE_FAILED: 'delete() failed due to some reason',
    DELETE_KEY_FAILED: 'deleteKey() failed due to some reason',
    READ_FAILED: 'read() failed for some reason',
    HAS_KEY_FAILED: 'hasKey() failed due to some reason',
    HAS_ID_FAILED: 'hasId() failed due to some reason'
  };
}

export declare class Database {
  constructor(dbDir: string, table: string);
  create(record: JsonValue): Promise<string>;
  read(id: string): Promise<JsonValue>;
  delete(id: string): Promise<void>;
  update(id: string, record: JsonValue): Promise<void>;
  static readonly ERROR_CODES: {
    CREATE_FAILED: 'create() failed due to some reason',
    RECORD_NOT_FOUND: 'read(), delete() or update() could not find the record Id',
    READ_FAILED: 'read() failed for some reason',
    DELETE_FAILED: 'delete() failed due to some reason',
    UPDATE_FAILED: 'update() failed due to some reason'
  };
}