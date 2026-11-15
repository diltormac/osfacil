import Dexie from "https://esm.sh/dexie@4.0.8";

export const db = new Dexie("OSFacilDB");

db.version(1).stores({
  ordens_servico: "id, status, created_at, nome, servico_finalizado, servico",
  resumo_dashboard: "id",
  sync_queue: "++id, osId, tipo",
  miniaturas_fotos: "url, os_id",
});
