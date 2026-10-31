import { supabaseClient } from "./supabase.js";

function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(arquivo);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

export async function salvarOSOffline(cadastro, arquivosFotos) {
  const fotosBase64 = [];
  for (const arquivo of arquivosFotos) {
    const base64 = await arquivoParaBase64(arquivo);
    fotosBase64.push({ nome: arquivo.name, base64 });
  }
  const novaOS = {
    idTemp: Date.now(),
    dados: cadastro,
    fotos: fotosBase64,
  };
  let pendentes = JSON.parse(
    localStorage.getItem("@osfacil_pendentes") || "[]",
  );
  pendentes.push(novaOS);
  localStorage.setItem("@osfacil_pendentes", JSON.stringify(pendentes));
}

export async function sincronizarPendentes(mostrarToastCallback) {
  let pendentes = JSON.parse(
    localStorage.getItem("@osfacil_pendentes") || "[]",
  );
  if (pendentes.length === 0) return;
  if (!navigator.onLine) return;
  const restantes = [];

  for (const os of pendentes) {
    if (!os.dados.valor || !os.dados.observacao || os.fotos.length === 0) {
      continue;
    }
    try {
      let urlsDasFotos = [];
      for (const foto of os.fotos) {
        const res = await fetch(foto.base64);
        const blob = await res.blob();
        const nomeArquivo = `${Date.now()}-${foto.nome.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const { error: uploadError } = await supabaseClient.storage
          .from("fotos-ordens")
          .upload(nomeArquivo, blob);
        if (uploadError) throw new Error("Erro upload");
        const { data: urlData } = supabaseClient.storage
          .from("fotos-ordens")
          .getPublicUrl(nomeArquivo);
        urlsDasFotos.push(urlData.publicUrl);
      }
      const cadastroFinal = { ...os.dados, fotos_urls: urlsDasFotos };
      const { error } = await supabaseClient
        .from("ordens_servico")
        .insert([cadastroFinal]);
      if (error) throw error;
    } catch (error) {
      restantes.push(os);
    }
  }
  localStorage.setItem("@osfacil_pendentes", JSON.stringify(restantes));
  if (restantes.length === 0 && pendentes.length > 0 && mostrarToastCallback) {
    mostrarToastCallback("Dados pendentes sincronizados!", "sucesso");
  }
}