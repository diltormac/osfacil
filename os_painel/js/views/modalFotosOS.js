// js/views/modalFotosOS.js
import { supabaseClient } from "../config.js";
import { listaOS, setListaOS } from "../state.js";
import { db } from "../db.js";
import {
  esc,
  urlSegura,
  toast,
  confirmarAcao,
  mensagemErro,
} from "../utils.js";
import { aplicarMiniaturasNaTela } from "./helpers.js"; // <-- IMPORTANTE: Importa a mágica

const BUCKET = "fotos-ordens";
const MAX_FOTOS = 10;
const TAMANHO_MAX_MB = 5;
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

/* =========================================================
   DETECÇÃO E REGISTRO DO PLUGIN CAPACITOR (Camera)
   ========================================================= */
function obterPluginCamera() {
  if (!window.Capacitor) return null;
  if (window.Camera && typeof window.Camera.getPhoto === "function") {
    return window.Camera;
  }
  if (typeof window.Capacitor.registerPlugin === "function") {
    try {
      const Camera = window.Capacitor.registerPlugin("Camera");
      window.Camera = Camera;
      return Camera;
    } catch (e) {
      console.warn("Não foi possível registrar o plugin Camera.", e);
    }
  }
  if (window.Capacitor.Plugins && window.Capacitor.Plugins.Camera) {
    window.Camera = window.Capacitor.Plugins.Camera;
    return window.Camera;
  }
  return null;
}

function ehNativo() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform?.());
}

/* =========================================================
   COMPRESSÃO DE IMAGEM E GERAÇÃO DE MINIATURA
   ========================================================= */
export function comprimirImagemWeb(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(arquivo);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // 1. Gera a Original (150KB)
        const canvasOriginal = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const MAX = 1024;
        if (width > height) {
          if (width > MAX) {
            height *= MAX / width;
            width = MAX;
          }
        } else {
          if (height > MAX) {
            width *= MAX / height;
            height = MAX;
          }
        }
        canvasOriginal.width = width;
        canvasOriginal.height = height;
        canvasOriginal.getContext("2d").drawImage(img, 0, 0, width, height);

        canvasOriginal.toBlob(
          (blobOriginal) => {
            const fileOriginal = new File([blobOriginal], arquivo.name, {
              type: "image/jpeg",
            });

            // 2. Gera a Miniatura (10KB)
            const canvasMini = document.createElement("canvas");
            let minW = img.width;
            let minH = img.height;
            const MAX_MINI = 300;
            if (minW > minH) {
              if (minW > MAX_MINI) {
                minH *= MAX_MINI / minW;
                minW = MAX_MINI;
              }
            } else {
              if (minH > MAX_MINI) {
                minW *= MAX_MINI / minH;
                minH = MAX_MINI;
              }
            }
            canvasMini.width = minW;
            canvasMini.height = minH;
            canvasMini.getContext("2d").drawImage(img, 0, 0, minW, minH);

            canvasMini.toBlob(
              (blobMini) => {
                // Cria o arquivo de miniatura com o sufixo _thumb
                const nomeMini = arquivo.name.replace(
                  /\.[^/.]+$/,
                  "_thumb.jpg",
                );
                const fileMini = new File([blobMini], nomeMini, {
                  type: "image/jpeg",
                });

                resolve({
                  original: fileOriginal,
                  miniatura: fileMini,
                  blobMini,
                });
              },
              "image/jpeg",
              0.6,
            );
          },
          "image/jpeg",
          0.7,
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (error) => reject(error);
  });
}

/* =========================================================
   CAPTURA DE FOTO
   ========================================================= */
async function capturarFoto() {
  const Camera = obterPluginCamera();

  if (ehNativo() && Camera) {
    try {
      const image = await Camera.getPhoto({
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
      return await comprimirImagemWeb(file); // Retorna o objeto { original, miniatura, blobMini }
    } catch (e) {
      if (e && e.message && e.message.toLowerCase().includes("cancel"))
        return null;
      console.warn("Erro na câmera nativa, tentando input file.", e);
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.display = "none";

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      input.remove();
      if (!file) return resolve(null);

      try {
        const resultado = await comprimirImagemWeb(file);
        resolve(resultado); // Retorna o objeto { original, miniatura, blobMini }
      } catch (err) {
        console.error("Falha ao comprimir imagem:", err);
        resolve({ original: file, miniatura: file, blobMini: null }); // Fallback de segurança
      }
    };

    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

/* =========================================================
   UPLOAD / BANCO / STORAGE
   ========================================================= */
function gerarNomeArquivo(osId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `os_${osId}_${ts}_${rand}.${ext}`;
}

function validarArquivo(file) {
  if (!file) return "Nenhum arquivo selecionado.";
  if (!TIPOS_ACEITOS.includes(file.type))
    return "Formato inválido. Use JPG, PNG ou WEBP.";
  if (file.size > TAMANHO_MAX_MB * 1024 * 1024)
    return `Arquivo muito grande. Máximo ${TAMANHO_MAX_MB}MB.`;
  return null;
}

// Função de Upload atualizada para aceitar um nome personalizado (para a miniatura)
async function uploadFoto(osId, file, nomeCustom = null) {
  const nome = nomeCustom || gerarNomeArquivo(osId, file);
  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(nome, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;
  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(nome);
  return data.publicUrl;
}

async function salvarFotosNoBanco(osId, fotosUrls) {
  const { error } = await supabaseClient
    .from("ordens_servico")
    .update({ fotos_urls: fotosUrls })
    .eq("id", osId);
  if (error) throw error;
}

async function deletarArquivoStorage(url) {
  try {
    const nomeArquivo = String(url).split("/").pop().split("?")[0];
    const { error } = await supabaseClient.storage
      .from(BUCKET)
      .remove([nomeArquivo]);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Falha ao remover arquivo do storage:", e);
    return false;
  }
}

/* =========================================================
   OVERLAY DE PROGRESSO
   ========================================================= */
function criarOverlayProgresso() {
  const div = document.createElement("div");
  div.className =
    "fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4";
  div.innerHTML = `
    <div class="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center">
      <div class="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-3">
        <i class="fa-solid fa-cloud-arrow-up text-indigo-600 text-2xl fa-bounce"></i>
      </div>
      <p class="font-bold text-slate-800 text-sm mb-1">Enviando fotos</p>
      <p data-role="status" class="text-xs text-slate-500">Preparando...</p>
      <div class="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full bg-indigo-600 animate-pulse" style="width: 100%"></div>
      </div>
    </div>
  `;
  return div;
}

/* =========================================================
   ADICIONAR FOTOS (câmera nativa + compressão)
   ========================================================= */
export async function adicionarFotosOS(osId) {
  const os = listaOS.find((o) => o.id === osId);
  if (!os) {
    toast("Esta OS não existe mais. Atualize a lista.", "error");
    return;
  }
  if (!supabaseClient) {
    toast("Sem conexão com o servidor. Não é possível enviar fotos.", "error");
    return;
  }

  const fotosAtuais = Array.isArray(os.fotos_urls) ? os.fotos_urls : [];
  if (fotosAtuais.length >= MAX_FOTOS) {
    toast(`Limite de ${MAX_FOTOS} fotos por OS atingido.`, "error");
    return;
  }

  // 1) Captura a foto (Retorna o objeto { original, miniatura, blobMini })
  const resultado = await capturarFoto();
  if (!resultado) return;
  const { original, miniatura, blobMini } = resultado;

  // 2) Valida a imagem original
  const erroValidacao = validarArquivo(original);
  if (erroValidacao) {
    toast(erroValidacao, "error");
    return;
  }

  // 3) Upload
  const overlay = criarOverlayProgresso();
  document.body.appendChild(overlay);
  const txt = overlay.querySelector("[data-role='status']");
  txt.textContent = `Enviando foto... (${original.name})`;

  try {
    // Gera os nomes baseados no nome do arquivo original
    const nomeOriginal = gerarNomeArquivo(osId, original);
    const nomeMini = nomeOriginal.replace(/\.[^/.]+$/, "_thumb.jpg");

    // Sobe a original
    const urlOriginal = await uploadFoto(osId, original, nomeOriginal);
    // Sobe a miniatura
    await uploadFoto(osId, miniatura, nomeMini);

    // Salva a miniatura local no Dexie
    if (blobMini) {
      await db.miniaturas_fotos.put({
        url: urlOriginal,
        os_id: osId,
        blob: blobMini,
      });
    }

    const novasUrls = [...fotosAtuais, urlOriginal];
    await salvarFotosNoBanco(osId, novasUrls);

    os.fotos_urls = novasUrls;
    setListaOS([...listaOS]);

    toast("Foto adicionada com sucesso!");
    atualizarGaleriaNoModal(os, novasUrls);
  } catch (err) {
    console.error(err);
    toast(mensagemErro(err, "salvar a foto"), "error");
  } finally {
    overlay.remove();
  }
}

/* =========================================================
   EXCLUIR FOTO
   ========================================================= */
export async function excluirFotoOS(osId, urlFoto) {
  const os = listaOS.find((o) => o.id === osId);
  if (!os) {
    toast("Esta OS não existe mais. Atualize a lista.", "error");
    return;
  }

  const continuar = await confirmarAcao({
    titulo: "Excluir Foto",
    mensagem:
      "Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita.",
    textoBotao: "Sim, Excluir",
    icone: "fa-trash-can",
    cor: "red",
  });
  if (!continuar) return;

  const fotosAtuais = Array.isArray(os.fotos_urls) ? os.fotos_urls : [];
  const novasUrls = fotosAtuais.filter((u) => u !== urlFoto);

  try {
    // Apaga a original do storage
    await deletarArquivoStorage(urlFoto);

    // Apaga a miniatura do storage
    const nomeMini = urlFoto
      .split("/")
      .pop()
      .replace(/\.[^/.]+$/, "_thumb.jpg");
    await deletarArquivoStorage(nomeMini);

    // Apaga a miniatura do Dexie local
    await db.miniaturas_fotos.delete(urlFoto);

    await salvarFotosNoBanco(osId, novasUrls);

    os.fotos_urls = novasUrls;
    setListaOS([...listaOS]);

    toast("Foto excluída com sucesso!");
    atualizarGaleriaNoModal(os, novasUrls);
  } catch (err) {
    console.error(err);
    toast(mensagemErro(err, "excluir a foto"), "error");
  }
}

/* =========================================================
   HTML DA GALERIA NO MODAL
   ========================================================= */
export function fotosOSHTML(os) {
  const fotos = (os.fotos_urls || []).filter((u) => urlSegura(u));

  if (!fotos.length) {
    return `
      <p class="text-xs text-slate-500 italic bg-slate-50 p-4 rounded-lg text-center mb-2">
        Nenhuma foto cadastrada nesta OS.
      </p>
      <button type="button" onclick="adicionarFotosOS(${os.id})"
        class="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2">
        <i class="fa-solid fa-camera" aria-hidden="true"></i>
        Adicionar Fotos (máx. ${MAX_FOTOS})
      </button>
    `;
  }

  const cards = fotos
    .map((url, idx) => {
      const seguro = urlSegura(url);
      return `
        <div class="relative group rounded-[10px] overflow-hidden border border-slate-200 bg-slate-100 aspect-square">
          <!-- ADICIONADO O data-original-url PARA A MÁGICA FUNCIONAR -->
          <img src="${seguro}" data-original-url="${seguro}" alt="Foto ${idx + 1} da OS"
            loading="lazy" decoding="async"
            class="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-110 os-foto"
            onclick="abrirLightboxPorOS(${os.id}, ${idx})" />

          <button type="button" title="Excluir esta foto"
            onclick="event.stopPropagation(); excluirFotoOS(${os.id}, '${seguro}')"
            class="absolute top-1 right-1 w-7 h-7 rounded-full bg-red-600/90 hover:bg-red-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10 shadow-lg"
            aria-label="Excluir foto ${idx + 1}">
            <i class="fa-solid fa-trash-can text-[11px]" aria-hidden="true"></i>
          </button>

          <span class="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
            ${idx + 1}
          </span>
        </div>
      `;
    })
    .join("");

  const podeAdicionar = fotos.length < MAX_FOTOS;
  const botaoAdicionar = podeAdicionar
    ? `
      <button type="button" onclick="adicionarFotosOS(${os.id})"
        class="aspect-square flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-[10px] transition"
        title="Adicionar mais fotos">
        <i class="fa-solid fa-camera text-xl" aria-hidden="true"></i>
        <span class="text-[9px] font-bold uppercase">Adicionar</span>
      </button>
    `
    : "";

  // Chama a mágica para buscar as miniaturas no Dexie e trocar na tela
  setTimeout(() => aplicarMiniaturasNaTela(), 50);

  return `
    <div id="modalFotosGrid" class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
      ${cards}
      ${botaoAdicionar}
    </div>
    <p class="text-[10px] text-slate-400 text-center">
      ${fotos.length}/${MAX_FOTOS} fotos • Passe o mouse para excluir
    </p>
  `;
}

function atualizarGaleriaNoModal(os, novasUrls) {
  const container = document.getElementById("modalFotosContainer");
  if (!container) return;

  const osAtualizada = { ...os, fotos_urls: novasUrls };
  container.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fotos Anexadas</p>
    </div>
    ${fotosOSHTML(osAtualizada)}
  `;
}
