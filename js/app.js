import { supabaseClient } from "./supabase.js";
import { comprimirImagemWeb } from "./camera.js";
import { salvarOSOffline, sincronizarPendentes } from "./database.js";

const MAX_FOTOS = 6;
const form = document.getElementById("osForm");
const photoGrid = document.getElementById("photoGrid");
const photoCount = document.getElementById("photoCount");
const photoSection = document.getElementById("photoSection");

const paisDDI = document.getElementById("paisDDI");
const btnDDI = document.getElementById("btnDDI");
const telefone = document.getElementById("telefone");
const nome = document.getElementById("nome");

const observacao = document.getElementById("observacao");
const submitButton = document.getElementById("submitButton");

let fotos = [];
let galeriaAtual = [];
let indexFotoAtual = 0;
let isSaving = false;
let nomeAparelho = localStorage.getItem("@osfacil_aparelho");

// Variáveis para guardar os detalhes temporários do serviço atual
let corReforma = "";
let numeroOSReforma = "";
let numeroOSConserto = "";

let itensOS = [];
let opcoesServico = [];

const CATALOGO_SERVICOS_KEY = "@osfacil_catalogo_servicos";
const CATALOGO_SERVICOS_FALLBACK = [
  { nome: "Alinhamento", valor: 50 },
  { nome: "Balanceamento", valor: 50 },
  { nome: "Conserto", valor: 150 },
  { nome: "Solda", valor: 150 },
  { nome: "Escapamento", valor: 200 },
  { nome: "Mecanica", valor: 200 },
  { nome: "Reforma", valor: 200 },
];

function normalizarItemCatalogo(item) {
  if (!item) return null;
  if (typeof item === "string") {
    const nome = item.trim();
    return nome ? { nome, valor: 0 } : null;
  }
  const nome = (item.nome || item.servico || item.descricao || "")
    .toString()
    .trim();
  if (!nome) return null;
  const valorRaw = item.valor ?? item.preco ?? item.valor_padrao ?? 0;
  const valor = Number(valorRaw) || 0;
  return { nome, valor };
}

async function carregarServicosFormulario() {
  try {
    if (navigator.onLine) {
      const { data, error } = await supabaseClient
        .from("catalogo_servicos")
        .select("*");
      if (error) throw error;

      if (data && data.length > 0) {
        opcoesServico = data
          .map(normalizarItemCatalogo)
          .filter((i) => i !== null);
        localStorage.setItem(
          CATALOGO_SERVICOS_KEY,
          JSON.stringify(opcoesServico),
        );
        return;
      }
    }
  } catch (err) {
    console.warn("Falha ao carregar catálogo do Supabase, usando cache.", err);
  }

  try {
    const cache = localStorage.getItem(CATALOGO_SERVICOS_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      if (Array.isArray(parsed) && parsed.length > 0) {
        opcoesServico = parsed
          .map(normalizarItemCatalogo)
          .filter((i) => i !== null);
        return;
      }
    }
  } catch (e) {
    console.warn("Cache de catálogo inválido.", e);
  }

  opcoesServico = [...CATALOGO_SERVICOS_FALLBACK];
}

function formatarValorInput(valorNumerico) {
  let v = (Number(valorNumerico) || 0).toFixed(2) + "";
  v = v.replace(".", ",");
  v = v.replace(/(\d)(\d{3})(\d{3}),/g, "$1.$2.$3,");
  v = v.replace(/(\d)(\d{3}),/g, "$1.$2,");
  return "R$ " + v;
}

/* =========================================================
   NOVA LÓGICA DO MODAL DE ADICIONAR SERVIÇO
   ========================================================= */

const btnAdicionarItem = document.getElementById("btnAdicionarItem");
const containerItens = document.getElementById("containerItensAdicionados");
const modalAdicionar = document.getElementById("modalAdicionarServico");
const modalSelectServico = document.getElementById("modalSelectServico");
const modalGrupoCor = document.getElementById("modalGrupoCor");
const modalInputCor = document.getElementById("modalInputCor");
const modalGrupoNumero = document.getElementById("modalGrupoNumero");
const modalInputNumero = document.getElementById("modalInputNumero");
const modalInputQtd = document.getElementById("modalInputQtd");
const modalInputValor = document.getElementById("modalInputValor");

// Máscara de valor no modal
modalInputValor.addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");
  v = (v / 100).toFixed(2) + "";
  v = v.replace(".", ",");
  v = v.replace(/(\d)(\d{3})(\d{3}),/g, "$1.$2.$3,");
  v = v.replace(/(\d)(\d{3}),/g, "$1.$2,");
  e.target.value = "R$ " + v;
});

btnAdicionarItem.onclick = () => {
  modalSelectServico.value = "";
  modalInputQtd.value = "1";
  modalInputValor.value = "";
  modalInputCor.value = "";
  modalInputNumero.value = "";
  modalGrupoCor.classList.add("hidden");
  modalGrupoNumero.classList.add("hidden");

  // Limpa os detalhes pendentes
  corReforma = "";
  numeroOSReforma = "";
  numeroOSConserto = "";

  modalSelectServico.innerHTML = '<option value="">Selecione...</option>';
  opcoesServico.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.nome;
    opt.textContent = item.nome;
    modalSelectServico.appendChild(opt);
  });

  modalAdicionar.classList.add("show");
};

document.getElementById("btnFecharModalAdicionar").onclick = () => {
  modalAdicionar.classList.remove("show");
};

modalSelectServico.addEventListener("change", async (e) => {
  const servNome = e.target.value;
  const servUpper = servNome.toUpperCase();

  modalGrupoCor.classList.add("hidden");
  modalGrupoNumero.classList.add("hidden");
  modalInputValor.value = "";

  const itemCat = opcoesServico.find((i) => i.nome === servNome);
  if (itemCat && itemCat.valor > 0) {
    modalInputValor.value = formatarValorInput(itemCat.valor);
  }

  // Regra da Reforma
  if (servUpper === "REFORMA") {
    modalGrupoCor.classList.remove("hidden");
    modalGrupoNumero.classList.remove("hidden");
    modalInputCor.value = corReforma || "";
    modalInputNumero.value = numeroOSReforma || "";
    setTimeout(() => modalInputCor.focus(), 150);

    if (!numeroOSReforma) {
      buscarProximoNumero(true, modalInputNumero);
    }
  }
  // Regra do Conserto/Solda
  else if (
    servUpper === "CONSERTO" ||
    servUpper === "SOLDA" ||
    servUpper === "CONSERTO/SOLDA"
  ) {
    modalGrupoNumero.classList.remove("hidden");
    modalInputCor.value = "";
    modalInputNumero.value = numeroOSConserto || "";
    setTimeout(() => modalInputNumero.focus(), 150);

    if (!numeroOSConserto) {
      buscarProximoNumero(false, modalInputNumero);
    }
  }
});

async function buscarProximoNumero(isReforma, inputNum) {
  inputNum.placeholder = "Buscando...";
  inputNum.disabled = true;

  try {
    let maxNum = isReforma ? 0 : 6142;

    if (navigator.onLine) {
      let query = supabaseClient.from("ordens_servico").select("*");

      if (isReforma) {
        query = query
          .eq("servico", "REFORMA")
          .not("numero_os", "is", null)
          .neq("numero_os", "");
      } else {
        query = query
          .in("servico", ["CONSERTO", "SOLDA", "CONSERTO/SOLDA"])
          .not("numero_os_conserto", "is", null)
          .neq("numero_os_conserto", "");
      }

      const { data } = await query;

      if (data) {
        data.forEach((item) => {
          const valItem = isReforma ? item.numero_os : item.numero_os_conserto;
          if (valItem) {
            const num = parseInt(valItem.toString().replace(/\D/g, ""));
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        });
      }
    }

    const pendentes = JSON.parse(
      localStorage.getItem("@osfacil_pendentes") || "[]",
    );
    pendentes.forEach((p) => {
      const servP = (p.dados.servico || "").toUpperCase();
      if (isReforma && servP === "REFORMA") {
        const valItem = p.dados.numero_os;
        if (valItem) {
          const num = parseInt(valItem.toString().replace(/\D/g, ""));
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      } else if (
        !isReforma &&
        (servP === "CONSERTO" ||
          servP === "SOLDA" ||
          servP === "CONSERTO/SOLDA")
      ) {
        const valItem = p.dados.numero_os_conserto;
        if (valItem) {
          const num = parseInt(valItem.toString().replace(/\D/g, ""));
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    });

    const proximoNum = isReforma
      ? maxNum + 1
      : maxNum >= 6143
        ? maxNum + 1
        : Math.max(6143, maxNum + 1);
    inputNum.value = proximoNum.toString();

    if (isReforma) {
      numeroOSReforma = inputNum.value;
    } else {
      numeroOSConserto = inputNum.value;
    }
  } catch (err) {
    console.error("Erro ao buscar próximo número da OS", err);
  } finally {
    inputNum.disabled = false;
    inputNum.placeholder = "Digite o número da OS";
  }
}

document.getElementById("btnConfirmarItem").onclick = () => {
  const serv = modalSelectServico.value;
  if (!serv) {
    mostrarToast("Selecione um serviço antes de adicionar.", "erro");
    return;
  }

  const qtd = parseInt(modalInputQtd.value) || 1;
  const valTexto = modalInputValor.value.replace(/[^\d]/g, "");
  const valNum = valTexto ? parseFloat(valTexto) / 100 : 0;

  const servUpper = serv.toUpperCase();
  const isReforma = servUpper === "REFORMA";
  const isConsertoOuSolda =
    servUpper === "CONSERTO" ||
    servUpper === "SOLDA" ||
    servUpper === "CONSERTO/SOLDA";

  if (isReforma && !modalInputCor.value.trim()) {
    mostrarToast("Por favor, digite a cor.", "erro");
    modalInputCor.focus();
    return;
  }

  if ((isReforma || isConsertoOuSolda) && !modalInputNumero.value.trim()) {
    mostrarToast("Por favor, digite o número da OS.", "erro");
    modalInputNumero.focus();
    return;
  }

  if (isReforma) {
    corReforma = modalInputCor.value.trim().toUpperCase();
    numeroOSReforma = modalInputNumero.value.trim();
    numeroOSConserto = "";
  } else if (isConsertoOuSolda) {
    numeroOSConserto = modalInputNumero.value.trim();
    corReforma = "";
    numeroOSReforma = "";
  } else {
    corReforma = "";
    numeroOSReforma = "";
    numeroOSConserto = "";
  }

  itensOS.push({
    servico: serv,
    quantidade: qtd,
    valor: valNum,
    cor: corReforma || null,
    numero_os: numeroOSReforma || null,
    numero_os_conserto: numeroOSConserto || null,
  });

  renderizarItensOS();
  atualizarProgresso();
  modalAdicionar.classList.remove("show");
};

function renderizarItensOS() {
  containerItens.innerHTML = "";

  if (itensOS.length === 0) {
    containerItens.innerHTML = `<p class="text-[11px] text-slate-400 italic text-center py-1">Nenhum serviço adicionado ainda.</p>`;
    return;
  }

  itensOS.forEach((item, index) => {
    const div = document.createElement("div");
    div.className =
      "flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs";
    div.innerHTML = `
      <div class="flex flex-col">
        <span class="font-bold text-slate-800">${item.servico} (Qtd: ${item.quantidade})</span>
        <span class="text-slate-500">R$ ${item.valor.toFixed(2).replace(".", ",")}</span>
        ${item.cor ? `<span class="text-indigo-600 font-medium">Cor: ${item.cor}</span>` : ""}
        ${item.numero_os ? `<span class="text-indigo-600 font-medium">Nº OS: ${item.numero_os}</span>` : ""}
        ${item.numero_os_conserto ? `<span class="text-indigo-600 font-medium">Nº OS Conserto: ${item.numero_os_conserto}</span>` : ""}
      </div>
      <button type="button" onclick="removerItemOS(${index})" class="text-red-500 hover:text-red-700 p-1">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    containerItens.appendChild(div);
  });
}

window.removerItemOS = function (index) {
  itensOS.splice(index, 1);
  renderizarItensOS();
  atualizarProgresso();
};

function verificarIdentificacaoAparelho() {
  if (
    !nomeAparelho ||
    nomeAparelho.trim() === "" ||
    nomeAparelho === "undefined" ||
    nomeAparelho === "null"
  ) {
    document.getElementById("modalIdentificacao").classList.add("show");
    document.getElementById("inputNomeAparelho").focus();
  } else {
    document.getElementById("nomeAparelhoDisplay").innerText = nomeAparelho;
  }
}

document.getElementById("btnSalvarIdentificacao").onclick = () => {
  let inputVal = document.getElementById("inputNomeAparelho").value.trim();
  if (inputVal === "") {
    alert("Por favor, digite um nome válido.");
    return;
  }
  nomeAparelho = inputVal.toUpperCase();
  localStorage.setItem("@osfacil_aparelho", nomeAparelho);
  document.getElementById("nomeAparelhoDisplay").innerText = nomeAparelho;
  document.getElementById("modalIdentificacao").classList.remove("show");
  mostrarToast("Aparelho identificado com sucesso!", "sucesso");
};

document.getElementById("triggerAlterarNome").onclick = () => {
  document.getElementById("modalIdentificacao").classList.add("show");
  document.getElementById("inputNomeAparelho").value = nomeAparelho || "";
  document.getElementById("inputNomeAparelho").focus();
};

verificarIdentificacaoAparelho();

// DDI e Telefonia
btnDDI.onclick = () => {
  if (paisDDI.value === "+55") {
    paisDDI.value = "+595";
    btnDDI.innerHTML = "🇵🇾 +595";
    telefone.placeholder = "(000) 000-000";
  } else {
    paisDDI.value = "+55";
    btnDDI.innerHTML = "🇧🇷 +55";
    telefone.placeholder = "(00) 00000-0000";
  }
  telefone.value = "";
  aplicarMascaraTelefone();
};

function mostrarToast(mensagem, tipo = "sucesso") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  const isSucesso = tipo === "sucesso";
  const bgColor = isSucesso ? "bg-green-500" : "bg-red-500";
  const icone = isSucesso ? "fa-circle-check" : "fa-circle-exclamation";
  toast.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 mb-2 transition-all duration-300 transform -translate-y-10 opacity-0 font-medium text-sm pointer-events-auto w-full max-w-[400px]`;
  toast.innerHTML = `<i class="fa-solid ${icone} text-lg"></i><span>${mensagem}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove("-translate-y-10", "opacity-0");
  }, 10);
  setTimeout(() => {
    toast.classList.add("-translate-y-10", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function renderFotos() {
  photoGrid.innerHTML = "";
  for (let i = 0; i < MAX_FOTOS; i++) {
    const foto = fotos[i];
    const slot = document.createElement("div");
    slot.className = "photo-slot";

    if (foto) {
      const imagem = document.createElement("img");
      imagem.src = foto.url;
      slot.appendChild(imagem);
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "photo-remove";
      remover.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      remover.addEventListener("click", () => {
        fotos.splice(i, 1);
        renderFotos();
        validarFotos();
        atualizarProgresso();
      });
      slot.appendChild(remover);
    } else {
      const adicionar = document.createElement("button");
      adicionar.type = "button";
      adicionar.className = "photo-add";
      adicionar.innerHTML = `<i class="fa-solid fa-camera"></i><span>Adicionar</span>`;

      adicionar.addEventListener("click", async () => {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
          try {
            const image = await window.Camera.getPhoto({
              quality: 70,
              allowEditing: false,
              resultType: "dataUrl",
              source: "CAMERA",
            });

            const res = await fetch(image.dataUrl);
            const blob = await res.blob();
            const file = new File([blob], `foto_${Date.now()}.jpeg`, {
              type: "image/jpeg",
            });

            fotos.push({ arquivo: file, url: image.dataUrl });
            renderFotos();
            validarFotos();
            atualizarProgresso();
          } catch (e) {
            if (e.message && e.message.toLowerCase().includes("cancel")) return;
            alert("Erro ao abrir a câmera: " + (e.message || e));
          }
        } else {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.capture = "environment";

          input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
              const arquivoLeve = await comprimirImagemWeb(file);
              fotos.push({
                arquivo: arquivoLeve,
                url: URL.createObjectURL(arquivoLeve),
              });
              renderFotos();
              validarFotos();
              atualizarProgresso();
            } catch (err) {
              alert("Erro ao processar a imagem.");
            }
          };
          input.click();
        }
      });
      slot.appendChild(adicionar);
    }
    photoGrid.appendChild(slot);
  }
  photoCount.textContent = `${fotos.length}/${MAX_FOTOS} fotos`;
  photoCount.className =
    fotos.length === MAX_FOTOS
      ? "rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-green-700"
      : "rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700";
}

function aplicarMascaraTelefone() {
  let numero = telefone.value.replace(/\D/g, "");
  if (numero.length === 0) {
    telefone.value = "";
    validarTelefone();
    atualizarProgresso();
    return;
  }

  if (paisDDI.value === "+55") {
    numero = numero.slice(0, 11);
    if (numero.length > 10) {
      numero = numero.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
    } else if (numero.length > 6) {
      numero = numero.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
    } else if (numero.length > 2) {
      numero = numero.replace(/^(\d{2})(\d+)/, "($1) $2");
    }
  } else {
    numero = numero.slice(0, 9);
    if (numero.length > 6) {
      numero = numero.replace(/^(\d{3})(\d{3})(\d{0,3})$/, "($1) $2-$3");
    } else if (numero.length > 3) {
      numero = numero.replace(/^(\d{3})(\d+)/, "($1) $2");
    }
  }
  telefone.value = numero;
  validarTelefone();
  atualizarProgresso();
}

telefone.addEventListener("input", aplicarMascaraTelefone);

function validarNome() {
  const valorNome = nome.value.trim();
  const valido = valorNome.length === 0 || valorNome.length >= 3;
  nome.classList.toggle("is-invalid", !valido && valorNome.length > 0);
  nome.classList.toggle("is-valid", valorNome.length >= 3);
  document.getElementById("statusNome").style.display =
    valorNome.length >= 3 ? "block" : "none";
  return valido;
}

function validarTelefone() {
  const digitos = telefone.value.replace(/\D/g, "");
  let valido = true;
  if (digitos.length > 0) {
    valido =
      paisDDI.value === "+55"
        ? digitos.length === 10 || digitos.length === 11
        : digitos.length === 9;
  }
  telefone.classList.toggle("is-invalid", !valido && digitos.length > 0);
  telefone.classList.toggle("is-valid", valido && digitos.length > 0);
  const icone = document.getElementById("statusTelefone");
  if (icone) {
    icone.style.display = valido && digitos.length > 0 ? "block" : "none";
  }
  return valido;
}

function validarServico() {
  const ok = itensOS.length > 0;
  containerItens.classList.toggle("border-red-500", !ok);
  return ok;
}

function validarObservacao() {
  const valido = observacao.value.trim().length >= 3;
  observacao.classList.toggle(
    "is-invalid",
    !valido && observacao.value.length > 0,
  );
  observacao.classList.toggle("is-valid", valido);
  return valido;
}

function validarFotos() {
  const valido = fotos.length > 0;
  photoSection.classList.toggle("has-error", !valido);
  return valido;
}

function atualizarProgresso() {
  const c1 = validarNome() && validarTelefone();
  const c2 = validarServico() && validarObservacao();
  const c3 = validarFotos();
  document.getElementById("step1").classList.toggle("done", c1);
  document.getElementById("step2").classList.toggle("done", c2);
  document.getElementById("step3").classList.toggle("done", c3);
  document.getElementById("step1").classList.toggle("active", !c1);
  document.getElementById("step2").classList.toggle("active", c1 && !c2);
  document.getElementById("step3").classList.toggle("active", c1 && c2 && !c3);
  document.getElementById("cardCliente").classList.toggle("is-valid", c1);
  document.getElementById("cardServico").classList.toggle("is-valid", c2);
}

nome.addEventListener("input", () => {
  validarNome();
  atualizarProgresso();
});
observacao.addEventListener("input", () => {
  validarObservacao();
  atualizarProgresso();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSaving) return;

  const okNome = validarNome();
  const okTelefone = validarTelefone();
  const okServico = validarServico();
  const okObservacao = validarObservacao();
  const okFotos = validarFotos();
  atualizarProgresso();

  if (!okNome || !okTelefone || !okServico || !okObservacao || !okFotos) {
    let msgErro = "Preencha todos os campos obrigatórios (*).";
    if (!okServico) msgErro = "Adicione pelo menos 1 serviço à OS.";
    if (!okObservacao) msgErro = "Por favor, preencha a descrição do serviço.";
    if (!okFotos) msgErro = "Por favor, adicione pelo menos 1 foto.";
    mostrarToast(msgErro, "erro");
    return;
  }

  isSaving = true;
  submitButton.disabled = true;
  submitButton.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> PROCESSANDO...';

  const telValor = telefone.value.trim();
  const telefoneCompleto = telValor
    ? `${paisDDI.value} ${telValor}`
    : "SEM CONTATO";

  let nomeFinal =
    nome.value.trim() === "" ? "CONSUMIDOR" : nome.value.trim().toUpperCase();

  // AQUI: Monta os serviços e o texto para a coluna de observação
  const servicosResumo = itensOS
    .map((i) => i.servico)
    .join(", ")
    .toUpperCase();
  const textoDigitado = observacao.value.trim().toUpperCase();

  // Mescla os serviços com a descrição do usuário
  let observacaoFinal = "";
  if (servicosResumo && textoDigitado) {
    observacaoFinal = `SERVIÇOS: ${servicosResumo} - ${textoDigitado}`;
  } else if (servicosResumo) {
    observacaoFinal = `SERVIÇOS: ${servicosResumo}`;
  } else {
    observacaoFinal = textoDigitado;
  }

  const valorTotalGeral = itensOS.reduce((soma, i) => soma + i.valor, 0);
  const qtdTotalGeral = itensOS.reduce((soma, i) => soma + i.quantidade, 0);

  const cadastro = {
    nome: nomeFinal,
    telefone: telefoneCompleto,
    servico: servicosResumo, // Coluna de serviço pura
    quantidade: qtdTotalGeral,
    valor: valorTotalGeral,
    itens_servicos: itensOS,
    observacao: observacaoFinal, // Coluna de observação com o texto mesclado
    aparelho: nomeAparelho || "Aparelho Desconhecido",
    cor: itensOS.find((i) => i.cor)?.cor || null,
    numero_os: itensOS.find((i) => i.numero_os)?.numero_os || null,
    numero_os_conserto:
      itensOS.find((i) => i.numero_os_conserto)?.numero_os_conserto || null,
  };

  const arquivosFotos = fotos.map((f) => f.arquivo);

  try {
    if (navigator.onLine) {
      submitButton.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> ENVIANDO...';

      let urlsDasFotos = [];
      for (const arquivo of arquivosFotos) {
        const nomeArquivo = `${Date.now()}-${Math.random().toString(36).substring(2)}.jpeg`;
        const { error: uploadError } = await supabaseClient.storage
          .from("fotos-ordens")
          .upload(nomeArquivo, arquivo);
        if (uploadError) throw new Error("Erro upload");
        const { data: urlData } = supabaseClient.storage
          .from("fotos-ordens")
          .getPublicUrl(nomeArquivo);
        urlsDasFotos.push(urlData.publicUrl);
      }

      const cadastroFinal = { ...cadastro, fotos_urls: urlsDasFotos };
      const { error } = await supabaseClient
        .from("ordens_servico")
        .insert([cadastroFinal]);
      if (error) throw error;

      mostrarToast("Pré-cadastro enviado com sucesso!", "sucesso");
    } else {
      await salvarOSOffline(cadastro, arquivosFotos);
      mostrarToast("Sem internet. Salvo no celular com segurança!", "sucesso");
    }

    form.reset();
    itensOS = [];
    renderizarItensOS();
    paisDDI.value = "+55";
    btnDDI.innerHTML = "🇧🇷 +55";
    telefone.placeholder = "(00) 00000-0000";

    corReforma = "";
    numeroOSReforma = "";
    numeroOSConserto = "";

    modalInputCor.value = "";
    modalInputNumero.value = "";

    fotos = [];
    renderFotos();
    photoSection.classList.remove("has-error");
    atualizarProgresso();
  } catch (error) {
    console.error(error);
    mostrarToast("Erro ao enviar. Tente novamente.", "erro");
    await salvarOSOffline(cadastro, arquivosFotos);
    mostrarToast("Salvo no celular! Enviaremos depois.", "erro");
  } finally {
    isSaving = false;
    submitButton.disabled = false;
    submitButton.innerHTML =
      '<i class="fa-solid fa-check"></i> ENVIAR PRÉ-CADASTRO';
  }
});

document.getElementById("btnFecharPesquisa").onclick = () => {
  document.getElementById("modalPesquisa").classList.add("hidden");
};

let timeoutBusca = null;
document.getElementById("inputBusca").addEventListener("input", executarBusca);

async function executarBusca() {
  clearTimeout(timeoutBusca);
  const termo = document
    .getElementById("inputBusca")
    .value.trim()
    .toUpperCase();
  const listaResultados = document.getElementById("listaResultados");

  if (!termo) {
    listaResultados.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs"><i class="fa-solid fa-clipboard text-2xl mb-2 text-slate-300"></i><p>Digite algo para pesquisar os serviços salvos.</p></div>`;
    return;
  }

  listaResultados.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs"><i class="fa-solid fa-spinner fa-spin text-lg mb-2"></i><p>Buscando ordens...</p></div>`;

  timeoutBusca = setTimeout(async () => {
    let ordens = [];
    if (navigator.onLine) {
      try {
        let query = supabaseClient
          .from("ordens_servico")
          .select("*")
          .order("id", { ascending: false })
          .limit(20);

        if (!isNaN(termo)) {
          query = query.eq("id", parseInt(termo));
        } else {
          query = query.ilike("nome", `%${termo}%`);
        }

        const { data, error } = await query;
        if (!error && data) {
          ordens = data.map((item) => ({
            id: item.id || "Nuvem",
            dados: item,
            fotosUrls: item.fotos_urls || [],
          }));
        }
      } catch (e) {
        console.error("Erro ao buscar no Supabase", e);
      }
    }

    const pendentes = JSON.parse(
      localStorage.getItem("@osfacil_pendentes") || "[]",
    );
    pendentes.forEach((p) => {
      const matchNome = p.dados.nome && p.dados.nome.includes(termo);
      const matchId = p.idTemp.toString().includes(termo);
      if (matchNome || matchId) {
        ordens.push({
          id: `Local #${p.idTemp}`,
          dados: p.dados,
          fotosUrls: p.fotos.map((f) => f.base64),
        });
      }
    });

    if (ordens.length === 0) {
      listaResultados.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs"><i class="fa-solid fa-face-frown text-2xl mb-2 text-slate-300"></i><p>Nenhuma ordem de serviço encontrada.</p></div>`;
      return;
    }

    listaResultados.innerHTML = "";
    ordens.forEach((os) => {
      const d = os.dados;
      const card = document.createElement("div");
      card.className =
        "bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-2";

      let fotosHtml = "";
      if (os.fotosUrls && os.fotosUrls.length > 0) {
        fotosHtml = `<div class="flex gap-1.5 overflow-x-auto py-1">`;
        const fotosArrayString = JSON.stringify(os.fotosUrls).replace(
          /"/g,
          "&quot;",
        );
        os.fotosUrls.forEach((url, idx) => {
          fotosHtml += `<img src="${url}" data-galeria='${fotosArrayString}' data-index="${idx}" class="img-mini w-14 h-14 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 flex-shrink-0" />`;
        });
        fotosHtml += `</div>`;
      } else {
        fotosHtml = `<span class="text-[10px] text-slate-400 italic">Sem fotos registradas.</span>`;
      }

      const telefoneExibir =
        d.telefone && d.telefone.trim() !== "+55" && d.telefone.trim() !== ""
          ? d.telefone
          : "Sem contato";

      let extraDetalhes = "";
      if (d.cor || d.numero_os) {
        extraDetalhes += `<div class="flex gap-3">${d.cor ? `<div><strong>Cor:</strong> ${d.cor}</div>` : ""} ${d.numero_os ? `<div><strong>Nº OS:</strong> ${d.numero_os}</div>` : ""}</div>`;
      }
      if (d.numero_os_conserto) {
        extraDetalhes += `<div class="flex gap-3"><div><strong>Nº OS Conserto:</strong> ${d.numero_os_conserto}</div></div>`;
      }

      card.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
          <span class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">ID: ${os.id}</span>
          <span class="text-[11px] font-bold text-slate-800">${d.servico} (Qtd: ${d.quantidade})</span>
        </div>
        <div class="text-[11px] text-slate-600 flex flex-col gap-0.5">
          <div><strong>Cliente:</strong> ${d.nome}</div>
          <div><strong>Telefone:</strong> ${telefoneExibir}</div>
          <div><strong>Valor:</strong> R$ ${Number(d.valor).toFixed(2).replace(".", ",")}</div>
          ${extraDetalhes}
          <div><strong>Obs:</strong> ${d.observacao}</div>
        </div>
        <div class="mt-1">
          <span class="text-[10px] font-bold text-slate-500 block mb-1">Imagens do Serviço:</span>
          ${fotosHtml}
        </div>
      `;
      listaResultados.appendChild(card);
    });

    document.querySelectorAll(".img-mini").forEach((imgEl) => {
      imgEl.onclick = () => {
        const galeria = JSON.parse(imgEl.getAttribute("data-galeria"));
        const idx = parseInt(imgEl.getAttribute("data-index"));
        abrirModalImagens(galeria, idx);
      };
    });
  }, 500);
}

function abrirModalImagens(arrayFotos, indexInicial) {
  galeriaAtual = arrayFotos;
  indexFotoAtual = indexInicial;
  document.getElementById("modalImagens").classList.remove("hidden");
  atualizarCarrossel();
}

document.getElementById("btnFecharImagens").onclick = () => {
  document.getElementById("modalImagens").classList.add("hidden");
};
document.getElementById("btnPrev").onclick = () => navegarImagem(-1);
document.getElementById("btnNext").onclick = () => navegarImagem(1);

function navegarImagem(direcao) {
  indexFotoAtual += direcao;
  if (indexFotoAtual >= galeriaAtual.length) indexFotoAtual = 0;
  if (indexFotoAtual < 0) indexFotoAtual = galeriaAtual.length - 1;
  atualizarCarrossel();
}

function atualizarCarrossel() {
  const img = document.getElementById("imagemAmpliada");
  const contador = document.getElementById("contadorFotoModal");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");

  img.style.opacity = 0;
  setTimeout(() => {
    img.src = galeriaAtual[indexFotoAtual];
    contador.textContent = `${indexFotoAtual + 1} / ${galeriaAtual.length}`;
    img.style.opacity = 1;
  }, 150);

  if (galeriaAtual.length > 1) {
    btnPrev.classList.remove("hidden");
    btnNext.classList.remove("hidden");
  } else {
    btnPrev.classList.add("hidden");
    btnNext.classList.add("hidden");
  }
}

carregarServicosFormulario();
renderFotos();
atualizarProgresso();
setInterval(() => sincronizarPendentes(mostrarToast), 15000);
window.addEventListener("online", () => {
  mostrarToast("Internet voltou! Sincronizando...", "sucesso");
  sincronizarPendentes(mostrarToast);
});
setTimeout(() => sincronizarPendentes(mostrarToast), 2000);
