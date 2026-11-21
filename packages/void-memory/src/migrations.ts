const fold = (column: string) => `replace(replace(${column},'ё','е'),'Ё','Е')`

export interface Migration {
  readonly version: number
  readonly statements: readonly string[]
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `create table node(
        id text primary key,
        kind text not null,
        project text,
        scope text not null default 'shared',
        title text,
        body text,
        props text not null default '{}' check(json_valid(props)),
        created_by text,
        session_id text,
        created_at integer not null,
        updated_at integer not null,
        invalidated_at integer,
        superseded_by text
      )`,
      `create table edge(
        src text not null,
        dst text not null,
        type text not null,
        props text not null default '{}' check(json_valid(props)),
        created_at integer not null,
        invalidated_at integer,
        primary key(src, dst, type)
      )`,
      `create index edge_src_type on edge(src, type)`,
      `create index edge_dst_type on edge(dst, type)`,
      `create index node_kind_project on node(kind, project)`,
      `create index node_kind_title on node(kind, title)`,
      `create virtual table node_fts using fts5(title, body, content='node', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2')`,
      `create trigger node_ai after insert on node begin
        insert into node_fts(rowid, title, body) values(new.rowid, ${fold("new.title")}, ${fold("new.body")});
      end`,
      `create trigger node_ad after delete on node begin
        insert into node_fts(node_fts, rowid, title, body) values('delete', old.rowid, ${fold("old.title")}, ${fold("old.body")});
      end`,
      `create trigger node_au after update of title, body on node begin
        insert into node_fts(node_fts, rowid, title, body) values('delete', old.rowid, ${fold("old.title")}, ${fold("old.body")});
        insert into node_fts(rowid, title, body) values(new.rowid, ${fold("new.title")}, ${fold("new.body")});
      end`,
      `create table task_event(
        seq integer primary key autoincrement,
        task_id text not null,
        actor text,
        from_status text,
        to_status text,
        note text,
        at integer not null
      )`,
      `create index task_event_task on task_event(task_id)`,
    ],
  },
]
