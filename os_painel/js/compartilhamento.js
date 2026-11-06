/**
 * Compartilha um texto e/ou uma imagem real (baixando o arquivo).
 * Usa o objeto global window.Capacitor para evitar erros de módulo no navegador.
 */
export async function compartilharTexto({
  titulo = "",
  texto = "",
  fotoUrl = "",
} = {}) {
  const conteudo = String(texto ?? "");

  // Verifica se está rodando no APK (Capacitor)
  const ehNativo = window.Capacitor?.isNativePlatform?.() || false;

  // ==========================================
  // 1. APLICATIVO ANDROID/IOS (Capacitor)
  // ==========================================
  if (ehNativo) {
    try {
      const Share = window.Capacitor?.Plugins?.Share;
      const Filesystem = window.Capacitor?.Plugins?.Filesystem;

      if (!Share || !Filesystem) {
        throw new Error("Plugins do Capacitor não encontrados.");
      }

      let arquivoParaCompartilhar = null;

      // Se tem foto, precisamos baixar e salvar no celular
      if (fotoUrl) {
        // 1. Baixa a imagem da internet
        const resposta = await fetch(fotoUrl);
        const blob = await resposta.blob();

        // 2. Converte para Base64 (necessário para o plugin de arquivos)
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // 3. Salva no cache do celular
        const nomeArquivo = `os-foto-${Date.now()}.jpg`;
        const resultadoArquivo = await Filesystem.writeFile({
          path: nomeArquivo,
          data: base64Data,
          directory: "CACHE", // Usa string para evitar erro de importação
        });

        // 4. Pega o caminho real do arquivo
        arquivoParaCompartilhar = resultadoArquivo.uri;
      }

      // 5. Abre o menu de compartilhamento do Android
      await Share.share({
        title: titulo,
        text: conteudo,
        url: arquivoParaCompartilhar || fotoUrl || undefined,
        dialogTitle: "Compartilhar OS",
      });

      return { status: "compartilhado" };
    } catch (e) {
      if (e && e.message && e.message.toLowerCase().includes("cancel")) {
        return { status: "cancelado" };
      }
      console.warn("Compartilhamento nativo falhou, tentando clipboard.", e);
    }
  }

  // ==========================================
  // 2. NAVEGADOR WEB (navigator.share)
  // ==========================================
  if (
    !ehNativo &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    let arquivo = null;
    if (fotoUrl) {
      try {
        const resposta = await fetch(fotoUrl, { mode: "cors" });
        const blob = await resposta.blob();
        arquivo = new File([blob], "os.jpg", { type: blob.type });
      } catch (err) {
        console.warn(
          "Não foi possível baixar a foto para compartilhar na web.",
          err,
        );
      }
    }

    const podeCompartilharArquivo =
      arquivo &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [arquivo] });

    try {
      if (podeCompartilharArquivo) {
        await navigator.share({
          title: titulo,
          text: conteudo,
          files: [arquivo],
        });
      } else {
        await navigator.share({ title: titulo, text: conteudo });
      }
      return { status: "compartilhado" };
    } catch (e) {
      if (e && e.name === "AbortError") {
        return { status: "cancelado" };
      }
      console.warn("Compartilhamento web falhou; tentando clipboard.", e);
    }
  }

  // ==========================================
  // 3. FALLBACK: ÁREA DE TRANSFERÊNCIA
  // ==========================================
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(conteudo);
      return { status: "copiado" };
    } catch (e) {
      console.warn("Não foi possível copiar para a área de transferência.", e);
    }
  }

  // ==========================================
  // 4. ÚLTIMO RECURSO: PROMPT MANUAL
  // ==========================================
  try {
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      window.prompt("Copie o texto abaixo:", conteudo);
      return { status: "manual" };
    }
  } catch (e) {
    console.error("Falha ao exibir o texto para cópia manual.", e);
  }

  return { status: "erro" };
}
