import { esc, urlSegura } from "../utils.js";
import { db } from "../db.js";

// Memória temporária para não tentar baixar a mesma foto quebrada várias vezes na mesma sessão
const miniaturasFalharam = new Set();

export function fecharCamadaPorId(id) {
  document.getElementById(id)?.remove();
}

export function imgFoto(url, classes, osId, index, titulo = "Ver foto") {
  const src = urlSegura(url);
  if (!src) return "";
  return `<img src="${src}" data-original-url="${src}" alt="${esc(titulo)}" loading="lazy" decoding="async" class="os-foto cursor-pointer transition-transform duration-300 hover:scale-125 ${classes}" onclick="event.stopPropagation(); abrirLightboxPorOS(${osId}, ${index})" title="${esc(titulo)}" />`;
}

export function tratarFotoQuebrada(img) {
  if (img.dataset.quebrada) return;
  img.dataset.quebrada = "1";
  const aviso = document.createElement("span");
  aviso.className = `foto-indisponivel ${img.className.replace(/\bos-foto\b|\bphoto-thumb\b|hover:\S+|cursor-pointer/g, "")}`;
  if (img.classList.contains("photo-thumb")) aviso.classList.add("photo-thumb");
  aviso.title = "Foto indisponível";
  aviso.setAttribute("role", "img");
  aviso.setAttribute("aria-label", "Foto indisponível");
  aviso.innerHTML = `<i class="fa-solid fa-image" aria-hidden="true"></i>`;
  img.replaceWith(aviso);
}

// ==========================================
// MÁGICA ATUALIZADA (Ignora fotos antigas)
// ==========================================
export async function aplicarMiniaturasNaTela() {
  const imagens = document.querySelectorAll("img.os-foto[data-original-url]");
  if (!imagens.length) return;

  for (const img of imagens) {
    // Se a imagem já foi processada, pula
    if (img.dataset.miniaturaProcessada) continue;

    const urlOriginal = img.getAttribute("data-original-url");
    if (!urlOriginal) continue;

    // Se já sabemos que essa foto não tem miniatura nesta sessão, pula
    if (miniaturasFalharam.has(urlOriginal)) continue;

    // Marca como processada para não rodar duas vezes na mesma tela
    img.dataset.miniaturaProcessada = "true";

    try {
      let registro = await db.miniaturas_fotos.get(urlOriginal);

      if (registro) {
        if (registro.blob) {
          if (img.src.startsWith("http")) {
            img.src = URL.createObjectURL(registro.blob);
          }
        }
        // Se registro.blob for null, significa que já foi tentado antes e falhou. Não faz nada.
      } else {
        const urlMiniatura = urlOriginal.replace(/\.[^/.]+$/, "_thumb.jpg");
        const resposta = await fetch(urlMiniatura);

        if (resposta.ok) {
          const blob = await resposta.blob();
          await db.miniaturas_fotos.put({ url: urlOriginal, blob });
          img.src = URL.createObjectURL(blob);
        } else {
          // Deu erro 400 (foto antiga sem miniatura). Salva como null para não tentar mais.
          await db.miniaturas_fotos.put({ url: urlOriginal, blob: null });
          miniaturasFalharam.add(urlOriginal);
        }
      }
    } catch (e) {
      // Falha de rede
      miniaturasFalharam.add(urlOriginal);
    }
  }
}
