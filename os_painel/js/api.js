import { supabaseClient } from "./config.js";
import {
  listaOS,
  setListaOS,
  adicionarListaOS,
  estado,
  itensRascunho,
  TAMANHO_PAGINA_OS,
  paginaOS,
  setPaginaOS,
  setTemMaisOS,
  setCarregandoMaisOS,
  TAMANHO_PAGINA_GALERIA,
  galeriaFotos,
  setGaleriaFotos,
  adicionarGaleriaFotos,
  paginaGaleria,
  setPaginaGaleria,
  setTemMaisGaleria,
  setCarregandoMaisGaleria,
  setGaleriaCarregamento,
  setGaleriaMensagemErro,
  setResumoDashboard,
  setUltimasOS,
  setDashboardCarregamento,
  setDashboardMensagemErro,
} from "./state.js";
import {
  toast,
  lerValor,
  mensagemErro,
  sinalTempoLimite,
  ehConsertoOuSolda,
  normalizar,
} from "./utils.js";

let carregando = false;

function normalizarOS(item) {
  return {
    ...item,
    status: item.status || "Pendente",
    nome: item.nome || "",
    telefone: item.telefone || "",
    servico: item.servico || "",
    fotos_urls: Array.isArray(item.fotos_urls)
      ? item.fotos_urls.filter(Boolean)
      : [],
    itens_servicos: Array.isArray(item.itens_servicos)
      ? item.itens_servicos
      : [],
  };
}

/* Monta a consulta de OS aplicando filtros de status, busca e datas. */
function montarConsultaOS({ comRange = true, limite = TAMANHO_PAGINA_OS, offset = 0 } = {}) {
  let consulta = supabaseClient.from("ordens_servico").select("*");

  if (estado.filtroStatus && estado.filtroStatus !== "all") {
    consulta = consulta.eq("status", estado.filtroStatus);
  }

  const termo = estado.busca.trim();
  if (termo) {
    const q = normalizar(termo);
    const qDigitos = q.replace(/\D/g, "");
    const partes = [];
    // Busca textual normalizada (usa coluna gerada busca_normalizada).
    partes.push(`busca_normalizada.ilike.%${q.replace(/[%,]/g, "")}%`);
    if (qDigitos.length >= 4) {
      partes.push(`telefone.ilike.%${qDigitos}%`);
    }
    consulta = consulta.or(partes.join(","));
  }

  if (estado.dataInicial) {
    consulta = consulta.gte("created_at", `${estado.dataInicial}T00:00:00`);
  }
  if (estado.dataFinal) {
    consulta = consulta.lte("created_at", `${estado.dataFinal}T23:59:59`);
  }

  switch (estado.ordenacao) {
    case "data-asc":
      consulta = consulta.order("created_at", { ascending: true });
      break;
    case "nome-asc":
      consulta = consulta.order("nome", { ascending: true });
      break;
    case "nome-desc":
      consulta = consulta.order("nome", { ascending: false });
      break;
    case "data-desc":
    default:
      consulta = consulta.order("created_at", { ascending: false });
      break;
  }

  if (comRange) {
    consulta = consulta.range(offset, offset + limite - 1);
  }
  return consulta;
}

async function executarConsulta(consulta) {
  const sinal = sinalTempoLimite();
  return sinal ? consulta.abortSignal(sinal) : consulta;
}

/* Carrega a primeira página de OS + resumo do dashboard + últimas OS + galeria. */
export async function carregarDados() {
  if (carregando) return;
  carregando = true;

  const { atualizarTudo, definirAtualizando } = await import("./ui.js");
  definirAtualizando(true);

  try {
    if (!supabaseClient) {
      throw new Error("Failed to fetch: biblioteca do Supabase não carregou");
    }

    setPaginaOS(0);
    const consulta = montarConsultaOS({ offset: 0 });
    const { data, error } = await executarConsulta(consulta);
    if (error) throw error;

    setListaOS((data || []).map(normalizarOS));
    setTemMaisOS((data || []).length === TAMANHO_PAGINA_OS);
    estado.carregamento = "ok";
    estado.mensagemErro = "";
  } catch (error) {
    console.error(error);
    estado.carregamento = "erro";
    estado.mensagemErro = mensagemErro(error, "carregar as ordens de serviço");
    if (listaOS.length) toast(estado.mensagemErro, "error");
  } finally {
    carregando = false;
    definirAtualizando(false);
    atualizarTudo();
  }

  // Dashboard e galeria são independentes: falhas aqui não bloqueiam a lista.
  carregarResumoDashboard();
  carregarUltimasOS();
  carregarGaleria();
}

/* Recarrega apenas a lista de OS (usado após mudança de filtro/busca/ordenação). */
export async function recarregarListaOS() {
  if (carregando) return;
  carregando = true;
  const { atualizarTudo, definirAtualizando } = await import("./ui.js");
  definirAtualizando(true);
  try {
    if (!supabaseClient) throw new Error("Failed to fetch");
    setPaginaOS(0);
    const { data, error } = await executarConsulta(montarConsultaOS({ offset: 0 }));
    if (error) throw error;
    setListaOS((data || []).map(normalizarOS));
    setTemMaisOS((data || []).length === TAMANHO_PAGINA_OS);
    estado.carregamento = "ok";
    estado.mensagemErro = "";
  } catch (error) {
    console.error(error);
    estado.carregamento = "erro";
    estado.mensagemErro = mensagemErro(error, "carregar as ordens de serviço");
  } finally {
    carregando = false;
    definirAtualizando(false);
    atualizarTudo();
  }
}

/* Carrega a próxima página de OS (botão "Carregar mais"). */
export async function carregarMaisOS() {
  if (carregando || !supabaseClient) return;
  carregando = true;
  setCarregandoMaisOS(true);
  const { renderOS } = await import("./ui.js");
  renderOS();
  try {
    const proximaPagina = paginaOS + 1;
    const offset = proximaPagina * TAMANHO_PAGINA_OS;
    const { data, error } = await executarConsulta(
      montarConsultaOS({ offset }),
    );
    if (error) throw error;
    const novos = (data || []).map(normalizarOS);
    adicionarListaOS(novos);
    setPaginaOS(proximaPagina);
    setTemMaisOS(novos.length === TAMANHO_PAGINA_OS);
  } catch (error) {
    console.error(error);
    toast(mensagemErro(error, "carregar mais ordens"), "error");
  } finally {
    carregando = false;
    setCarregandoMaisOS(false);
    renderOS();
  }
}

/* Resumo agregado do dashboard (RPC resumo_os). */
export async function carregarResumoDashboard() {
  if (!supabaseClient) return;
  setDashboardCarregamento("carregando");
  try {
    const { data, error } = await executarConsulta(
      supabaseClient.rpc("resumo_os"),
    );
    if (error) throw error;
    setResumoDashboard(data || null);
    setDashboardCarregamento("ok");
    setDashboardMensagemErro("");
  } catch (error) {
    console.error(error);
    setDashboardCarregamento("erro");
    setDashboardMensagemErro(
      mensagemErro(error, "carregar o resumo do dashboard"),
    );
  } finally {
    const { renderDashboard } = await import("./ui.js");
    renderDashboard();
  }
}

/* Últimas 10 OS para o dashboard. */
export async function carregarUltimasOS() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await executarConsulta(
      supabaseClient
        .from("ordens_servico")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    );
    if (error) throw error;
    setUltimasOS((data || []).map(normalizarOS));
  } catch (error) {
    console.error(error);
    setUltimasOS([]);
  } finally {
    const { renderDashboard } = await import("./ui.js");
    renderDashboard();
  }
}

/* Primeira página da galeria. */
export async function carregarGaleria() {
  if (!supabaseClient) return;
  setGaleriaCarregamento("carregando");
  try {
    const { data, error } = await executarConsulta(
      supabaseClient
        .from("ordens_servico")
        .select("id, nome, numero_os, numero_os_conserto, servico, fotos_urls, created_at")
        .not("fotos_urls", "is", null)
        .order("created_at", { ascending: false })
        .range(0, TAMANHO_PAGINA_GALERIA - 1),
    );
    if (error) throw error;
    const fotos = [];
    (data || []).forEach((o) => {
      (o.fotos_urls || []).forEach((url, index) => {
        if (url) fotos.push({ os: normalizarOS(o), url, index });
      });
    });
    setGaleriaFotos(fotos);
    setPaginaGaleria(0);
    setTemMaisGaleria((data || []).length === TAMANHO_PAGINA_GALERIA);
    setGaleriaCarregamento("ok");
    setGaleriaMensagemErro("");
  } catch (error) {
    console.error(error);
    setGaleriaCarregamento("erro");
    setGaleriaMensagemErro(mensagemErro(error, "carregar a galeria"));
  } finally {
    const { renderGaleria } = await import("./ui.js");
    renderGaleria();
  }
}

/* Próxima página da galeria. */
export async function carregarMaisGaleria() {
  if (!supabaseClient) return;
  setCarregandoMaisGaleria(true);
  const { renderGaleria } = await import("./ui.js");
  renderGaleria();
  try {
    const proximaPagina = paginaGaleria + 1;
    const offset = proximaPagina * TAMANHO_PAGINA_GALERIA;
    const { data, error } = await executarConsulta(
      supabaseClient
        .from("ordens_servico")
        .select("id, nome, numero_os, numero_os_conserto, servico, fotos_urls, created_at")
        .not("fotos_urls", "is", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + TAMANHO_PAGINA_GALERIA - 1),
    );
    if (error) throw error;
    const fotos = [];
    (data || []).forEach((o) => {
      (o.fotos_urls || []).forEach((url, index) => {
        if (url) fotos.push({ os: normalizarOS(o), url, index });
      });
    });
    adicionarGaleriaFotos(fotos);
    setPaginaGaleria(proximaPagina);
    setTemMaisGaleria((data || []).length === TAMANHO_PAGINA_GALERIA);
  } catch (error) {
    console.error(error);
    toast(mensagemErro(error, "carregar mais fotos"), "error");
  } finally {
    setCarregandoMaisGaleria(false);
    renderGaleria();
  }
}

/* Trava um botão durante uma operação e devolve uma função que o destrava. */
function travarBotao(id, textoOcupado) {
  const btn = document.getElementById(id);
  if (!btn) return () => {};
  if (btn.disabled) return null; // já está em andamento
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${textoOcupado}`;
  return () => {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.innerHTML = original;
  };
}

function marcarCampoInvalido(id, mensagem) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("is-invalid");
    el.setAttribute("aria-invalid", "true");
    el.focus();
    el.addEventListener(
      "input",
      () => {
        el.classList.remove("is-invalid");
        el.removeAttribute("aria-invalid");
      },
      { once: true },
    );
  }
  toast(mensagem, "error");
}

export async function salvarEdicoes(id) {
  const osAtual = listaOS.find((o) => o.id === id);
  if (!osAtual) {
    toast("Esta OS não existe mais. Atualize a lista.", "error");
    return;
  }

  const inputNumVal = document
    .getElementById("editNumeroOS")
    .value.trim()
    .toUpperCase();

  const nome = document.getElementById("editNome").value.trim().toUpperCase();
  const telefone = document.getElementById("editTelefone").value.trim();
  const novoValor = lerValor(document.getElementById("editValor").value);
  const novaObs = document
    .getElementById("editObservacao")
    .value.trim()
    .toUpperCase();

  if (!nome) return marcarCampoInvalido("editNome", "Informe o nome do cliente.");
  if (!telefone)
    return marcarCampoInvalido("editTelefone", "Informe o telefone do cliente.");
  if (novoValor === null)
    return marcarCampoInvalido(
      "editValor",
      "Valor total inválido. Use apenas números, ex: 150,00 (ou 0 se não houver cobrança).",
    );
  if (novoValor < 0)
    return marcarCampoInvalido("editValor", "O valor total não pode ser negativo.");

  const dadosAtualizacao = {
    status: document.getElementById("editStatus").value,
    nome,
    telefone,
    valor: novoValor,
    observacao: novaObs,
    itens_servicos: itensRascunho.map((i) => ({ ...i })),
  };

  if (ehConsertoOuSolda(osAtual)) {
    dadosAtualizacao.numero_os_conserto = inputNumVal;
  } else {
    dadosAtualizacao.numero_os = inputNumVal;
  }

  const destravar = travarBotao("btnSalvarOS", "Salvando…");
  if (!destravar) return;
  const btnExcluir = document.getElementById("btnExcluirOS");
  if (btnExcluir) btnExcluir.disabled = true;

  try {
    if (!supabaseClient) throw new Error("Failed to fetch");
    const consulta = supabaseClient
      .from("ordens_servico")
      .update(dadosAtualizacao)
      .eq("id", id);
    const sinal = sinalTempoLimite();
    const { error } = await (sinal ? consulta.abortSignal(sinal) : consulta);
    if (error) throw error;

    // Só agora o que estava no rascunho passa a valer na lista local.
    Object.assign(osAtual, dadosAtualizacao);
    toast("OS atualizada com sucesso!");
    const { fecharModal } = await import("./ui.js");
    fecharModal({ forcar: true });
    // Atualiza apenas o necessário: resumo do dashboard e últimas OS.
    carregarResumoDashboard();
    carregarUltimasOS();
  } catch (error) {
    console.error(error);
    // Os dados digitados continuam no formulário para tentar de novo.
    toast(mensagemErro(error, "salvar as alterações"), "error");
    destravar();
    if (btnExcluir) btnExcluir.disabled = false;
  }
}

export async function excluirOS(id) {
  const os = listaOS.find((o) => o.id === id);
  if (!os) {
    toast("Esta OS não existe mais. Atualize a lista.", "error");
    return;
  }
  const qtdFotos = os.fotos_urls?.length || 0;
  const aviso =
    qtdFotos > 0
      ? `Excluir a OS de ${os.nome || "cliente sem nome"}? As ${qtdFotos} foto(s) também serão apagadas. Esta ação não pode ser desfeita.`
      : `Excluir a OS de ${os.nome || "cliente sem nome"}? Esta ação não pode ser desfeita.`;
  if (!confirm(aviso)) return;

  const destravar = travarBotao("btnExcluirOS", "Excluindo…");
  if (!destravar) return;
  const btnSalvar = document.getElementById("btnSalvarOS");
  if (btnSalvar) btnSalvar.disabled = true;

  try {
    if (!supabaseClient) throw new Error("Failed to fetch");
    // 1º apaga o registro. Se falhar, nada foi perdido (fotos continuam).
    const consulta = supabaseClient
      .from("ordens_servico")
      .delete()
      .eq("id", id);
    const sinal = sinalTempoLimite();
    const { error } = await (sinal ? consulta.abortSignal(sinal) : consulta);
    if (error) throw error;

    // 2º apaga as fotos. Se falhar aqui, a OS já foi excluída; só avisamos.
    let fotosFalharam = false;
    if (qtdFotos > 0) {
      try {
        const arquivos = os.fotos_urls.map(
          (url) => String(url).split("/").pop().split("?")[0],
        );
        const { error: erroFotos } = await supabaseClient.storage
          .from("fotos-ordens")
          .remove(arquivos);
        if (erroFotos) throw erroFotos;
      } catch (e) {
        console.error(e);
        fotosFalharam = true;
      }
    }

    setListaOS(listaOS.filter((o) => o.id !== id));
    toast(
      fotosFalharam
        ? "OS excluída, mas algumas fotos não puderam ser apagadas do armazenamento."
        : "OS excluída com sucesso!",
      fotosFalharam ? "error" : "success",
    );
    const { fecharModal } = await import("./ui.js");
    fecharModal({ forcar: true });
    // Atualiza apenas o necessário.
    carregarResumoDashboard();
    carregarUltimasOS();
    carregarGaleria();
  } catch (error) {
    console.error(error);
    toast(mensagemErro(error, "excluir a OS"), "error");
    destravar();
    if (btnSalvar) btnSalvar.disabled = false;
  }
}
