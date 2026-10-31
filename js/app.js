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

const inputServico = document.getElementById("servico");
const inputQuantidade = document.getElementById("quantidade");
const fakeServico = document.getElementById("fakeServico");
const fakeQuantidade = document.getElementById("fakeQuantidadeVisivel");

const valor = document.getElementById("valor");
const observacao = document.getElementById("observacao");
const submitButton = document.getElementById("submitButton");

let fotos = [];
let galeriaAtual = [];
let indexFotoAtual = 0;
let isSaving = false;
let nomeAparelho = localStorage.getItem("@osfacil_aparelho");

let corReforma = "";
let numeroOSReforma = "";
let numeroOSConserto = "";

// Identificação
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

// Modal de Detalhes
async function abrirModalDetalhesServico() {
  const servicoSelecionado = inputServico.value;
  const grupoCor = document.getElementById("grupoCorModal");
  const inputCor = document.getElementById("inputCor");
  const inputNum = document.getElementById("inputNumeroOSDinamico");
  const tituloModal = document.getElementById("tituloModalDetalhes");

  inputCor.classList.remove("is-invalid");
  inputNum.classList.remove("is-invalid");

  if (servicoSelecionado === "REFORMA") {
    tituloModal.innerHTML = `<i class="fa-solid fa-spray-can-sparkles text-indigo-600 mr-1"></i> Detalhes da Reforma`;
    grupoCor.style.display = "block";
    inputCor.value = corReforma || "";
    inputNum.value = numeroOSReforma || "";
  } else if (servicoSelecionado === "CONSERTO/SOLDA") {
    tituloModal.innerHTML = `<i class="fa-solid fa-wrench text-indigo-600 mr-1"></i> Detalhes do Conserto/Solda`;
    grupoCor.style.display = "none";
    inputCor.value = "";
    inputNum.value = numeroOSConserto || "";
  }

  document.getElementById("modalDetalhesServico").classList.add("show");
  if (servicoSelecionado === "REFORMA") {
    setTimeout(() => inputCor.focus(), 150);
  } else {
    setTimeout(() => inputNum.focus(), 150);
  }

  if (
    (servicoSelecionado === "REFORMA" && !numeroOSReforma) ||
    (servicoSelecionado === "CONSERTO/SOLDA" && !numeroOSConserto)
  ) {
    inputNum.placeholder = "Buscando...";
    inputNum.disabled = true;

    try {
      let maxNum = servicoSelecionado === "CONSERTO/SOLDA" ? 6142 : 0;

      if (navigator.onLine) {
        const colunaBusca =
          servicoSelecionado === "REFORMA" ? "numero_os" : "numero_os_conserto";
        const { data } = await supabaseClient
          .from("ordens_servico")
          .select(colunaBusca)
          .eq("servico", servicoSelecionado)
          .not(colunaBusca, "is", null)
          .neq(colunaBusca, "");

        if (data) {
          data.forEach((item) => {
            const valItem = item[colunaBusca];
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
        if (p.dados.servico === servicoSelecionado) {
          const valItem =
            servicoSelecionado === "REFORMA"
              ? p.dados.numero_os
              : p.dados.numero_os_conserto;
          if (valItem) {
            const num = parseInt(valItem.toString().replace(/\D/g, ""));
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      });

      const proximoNum =
        maxNum >= 6143 ? maxNum + 1 : Math.max(6143, maxNum + 1);
      inputNum.value = proximoNum.toString();

      if (servicoSelecionado === "REFORMA") {
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
}

function fecharModalDetalhesServico() {
  const servicoSelecionado = inputServico.value;
  const inputCor = document.getElementById("inputCor");
  const inputNum = document.getElementById("inputNumeroOSDinamico");

  if (
    (servicoSelecionado === "REFORMA" &&
      (!inputCor.value || !inputNum.value)) ||
    (servicoSelecionado === "CONSERTO/SOLDA" && !inputNum.value)
  ) {
    inputServico.value = "";
    fakeServico.innerText = "Selec.";
    corReforma = "";
    numeroOSReforma = "";
    numeroOSConserto = "";
    validarServico();
    atualizarProgresso();
  }
  document.getElementById("modalDetalhesServico").classList.remove("show");
}

document.getElementById("btnFecharModalDetalhes").onclick =
  fecharModalDetalhesServico;
document.getElementById("btnSalvarDetalhes").onclick = () => {
  const servicoSelecionado = inputServico.value;
  const inputCor = document.getElementById("inputCor");
  const inputNum = document.getElementById("inputNumeroOSDinamico");
  const cor = inputCor.value.trim();
  const numeroOS = inputNum.value.trim();

  inputCor.classList.remove("is-invalid");
  inputNum.classList.remove("is-invalid");

  if (servicoSelecionado === "REFORMA" && cor === "") {
    inputCor.classList.add("is-invalid");
    inputCor.focus();
    mostrarToast("Por favor, digite a cor.", "erro");
    return;
  }
  if (numeroOS === "") {
    inputNum.classList.add("is-invalid");
    inputNum.focus();
    mostrarToast("Por favor, digite o número da OS.", "erro");
    return;
  }

  if (servicoSelecionado === "REFORMA") {
    corReforma = cor.toUpperCase();
    numeroOSReforma = numeroOS;
  } else if (servicoSelecionado === "CONSERTO/SOLDA") {
    numeroOSConserto = numeroOS;
  }

  document.getElementById("modalDetalhesServico").classList.remove("show");
  mostrarToast("Detalhes salvos com sucesso!", "sucesso");
  validarServico();
  atualizarProgresso();
};

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

// Modais de Opções
const opcoesServico = [
  "Alinhar/Balancear",
  "Conserto/Solda",
  "Escapamento",
  "Mecanica",
  "Reforma",
];
const opcoesQuantidade = ["1", "2", "3", "4", "5", "6"];
let campoAtivoModal = "";

fakeServico.onclick = () => abrirModalOpcoes("servico");
fakeQuantidade.onclick = () => abrirModalOpcoes("quantidade");

function abrirModalOpcoes(campo) {
  campoAtivoModal = campo;
  const modal = document.getElementById("customModal");
  const titulo = document.getElementById("modalTitle");
  const lista = document.getElementById("modalList");

  const opcoes = campo === "servico" ? opcoesServico : opcoesQuantidade;
  const valorAtual =
    campo === "servico" ? inputServico.value : inputQuantidade.value;

  titulo.innerText =
    campo === "servico" ? "Selecione o Serviço" : "Selecione a Quantidade";
  lista.innerHTML = "";

  opcoes.forEach((opt) => {
    const div = document.createElement("div");
    div.className = `modal-item ${valorAtual === opt ? "selected" : ""}`;
    div.innerHTML = `<span>${opt}</span> ${valorAtual === opt ? '<i class="fa-solid fa-check"></i>' : ""}`;
    div.onclick = () => selecionarOpcao(opt);
    lista.appendChild(div);
  });

  modal.classList.add("show");
}

document.getElementById("btnFecharModalOpcoes").onclick = () => {
  document.getElementById("customModal").classList.remove("show");
};

function selecionarOpcao(valorSelecionado) {
  if (campoAtivoModal === "servico") {
    inputServico.value = valorSelecionado;
    fakeServico.innerText = valorSelecionado;

    if (valorSelecionado !== "Reforma") {
      corReforma = "";
      numeroOSReforma = "";
    }
    if (valorSelecionado !== "Conserto/Solda") {
      numeroOSConserto = "";
    }

    validarServico();

    const tabelaPrecos = {
      "Alinhar/Balancear": 50,
      "Conserto/Solda": 150,
      Escapamento: 200,
      Mecanica: 200,
      Reforma: 200,
    };
    if (tabelaPrecos[valorSelecionado]) {
      inputQuantidade.value = "1";
      fakeQuantidade.innerText = "1";
      valor.value = (tabelaPrecos[valorSelecionado] * 100).toString();
      valor.dispatchEvent(new Event("input"));
      validarQuantidade();
    }

    if (
      valorSelecionado === "Reforma" ||
      valorSelecionado === "Conserto/Solda"
    ) {
      document.getElementById("customModal").classList.remove("show");
      abrirModalDetalhesServico();
      atualizarProgresso();
      return;
    }
  } else {
    inputQuantidade.value = valorSelecionado;
    fakeQuantidade.innerText = valorSelecionado;
    validarQuantidade();
  }
  document.getElementById("customModal").classList.remove("show");
  atualizarProgresso();
}

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

// Renderização de fotos
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
            // 'Camera' bareword não resolve em módulo ES — usar window.Camera
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

valor.addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");
  v = (v / 100).toFixed(2) + "";
  v = v.replace(".", ",");
  v = v.replace(/(\d)(\d{3})(\d{3}),/g, "$1.$2.$3,");
  v = v.replace(/(\d)(\d{3}),/g, "$1.$2,");
  e.target.value = "R$ " + v;
  validarValor();
  atualizarProgresso();
});

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
  let ok = inputServico.value !== "";
  if (ok) {
    if (inputServico.value === "REFORMA") {
      ok = corReforma !== "" && numeroOSReforma !== "";
    } else if (inputServico.value === "CONSERTO/SOLDA") {
      ok = numeroOSConserto !== "";
    }
  }
  fakeServico.classList.toggle("is-invalid", !ok);
  fakeServico.classList.toggle("is-valid", ok);
  return ok;
}
function validarQuantidade() {
  const ok = inputQuantidade.value !== "";
  fakeQuantidade.classList.toggle("is-invalid", !ok);
  fakeQuantidade.classList.toggle("is-valid", ok);
  return ok;
}
function validarValor() {
  const temValor = valor.value.replace(/\D/g, "").length > 0;
  valor.classList.toggle("is-invalid", !temValor && valor.value.length > 0);
  valor.classList.toggle("is-valid", temValor);
  return temValor;
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
  const c2 =
    validarServico() &&
    validarQuantidade() &&
    validarValor() &&
    validarObservacao();
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
  const okQuantidade = validarQuantidade();
  const okValor = validarValor();
  const okObservacao = validarObservacao();
  const okFotos = validarFotos();
  atualizarProgresso();

  if (
    !okNome ||
    !okTelefone ||
    !okServico ||
    !okQuantidade ||
    !okValor ||
    !okObservacao ||
    !okFotos
  ) {
    let msgErro = "Preencha todos os campos obrigatórios (*).";
    if (!okObservacao) msgErro = "Por favor, preencha a descrição do serviço.";
    if (!okFotos) msgErro = "Por favor, adicione pelo menos 1 foto.";
    mostrarToast(msgErro, "erro");
    return;
  }

  isSaving = true;
  submitButton.disabled = true;
  submitButton.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> PROCESSANDO...';

  const valorNumerico = parseFloat(
    valor.value.replace(/[^\d,]/g, "").replace(",", "."),
  );

  const telValor = telefone.value.trim();
  const telefoneCompleto = telValor
    ? `${paisDDI.value} ${telValor}`
    : "SEM CONTATO";

  let nomeFinal =
    nome.value.trim() === "" ? "CONSUMIDOR" : nome.value.trim().toUpperCase();

  const cadastro = {
    nome: nomeFinal,
    telefone: telefoneCompleto,
    servico: inputServico.value.toUpperCase(),
    quantidade: parseInt(inputQuantidade.value),
    valor: valorNumerico,
    observacao: observacao.value.trim().toUpperCase(),
    aparelho: nomeAparelho || "Aparelho Desconhecido",
    cor: inputServico.value === "REFORMA" ? corReforma || null : null,
    numero_os:
      inputServico.value === "REFORMA" ? numeroOSReforma || null : null,
    numero_os_conserto:
      inputServico.value === "CONSERTO/SOLDA" ? numeroOSConserto || null : null,
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
    paisDDI.value = "+55";
    btnDDI.innerHTML = "🇧🇷 +55";
    telefone.placeholder = "(00) 00000-0000";
    valor.value = "";
    inputServico.value = "";
    fakeServico.innerText = "Selec.";
    inputQuantidade.value = "";
    fakeQuantidade.innerText = "0";
    corReforma = "";
    numeroOSReforma = "";
    numeroOSConserto = "";
    document.getElementById("inputCor").value = "";
    document.getElementById("inputNumeroOSDinamico").value = "";
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

// Pesquisa
document.getElementById("btnAbrirPesquisa").onclick = () => {
  document.getElementById("modalPesquisa").classList.remove("hidden");
  document.getElementById("inputBusca").focus();
  executarBusca();
};
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

// Modal de Imagens
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

// Eventos iniciais
renderFotos();
atualizarProgresso();
setInterval(() => sincronizarPendentes(mostrarToast), 15000);
window.addEventListener("online", () => {
  mostrarToast("Internet voltou! Sincronizando...", "sucesso");
  sincronizarPendentes(mostrarToast);
});
setTimeout(() => sincronizarPendentes(mostrarToast), 2000);
