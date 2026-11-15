import { supabaseClient } from "./supabase.js";

function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(arquivo);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

export async function salvarOSOffline(cadastro, fotosArray) {
  const fotosBase64 = [];

  for (const foto of fotosArray) {
    const base64Original = await arquivoParaBase64(foto.original);
    let base64Mini = null;
    if (foto.miniatura) {
      base64Mini = await arquivoParaBase64(foto.miniatura);
    }
    fotosBase64.push({
      nome: foto.original.name,
      base64Original,
      base64Mini,
    });
  }

  const novaOS = {
    idTemp: Date.now(),
    dados: cadastro,
    fotos: fotosBase64,
  };

  let pendentes = JSON.parse(
    localStorage.getItem("@osfacil_pendentes") || "[]",
  );
  const jaExiste = pendentes.some(
    (p) => p.dados.uuid_local === cadastro.uuid_local,
  );
  if (!jaExiste) {
    pendentes.push(novaOS);
    localStorage.setItem("@osfacil_pendentes", JSON.stringify(pendentes));
  }
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
      if (os.dados.uuid_local) {
        const { data: existente } = await supabaseClient
          .from("ordens_servico")
          .select("id")
          .eq("uuid_local", os.dados.uuid_local)
          .maybeSingle();

        if (existente) {
          continue; // Já está no banco, pula
        }
      }

      let urlsDasFotos = [];
      for (const foto of os.fotos) {
        // Prepara o nome base
        const nomeArquivo = `${Date.now()}-${foto.nome.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const nomeMini = nomeArquivo.replace(/\.[^/.]+$/, "_thumb.jpg");

        // 1. Upload da Original
        const resOrig = await fetch(foto.base64Original);
        const blobOrig = await resOrig.blob();
        const { error: errOrig } = await supabaseClient.storage
          .from("fotos-ordens")
          .upload(nomeArquivo, blobOrig);

        if (errOrig) throw new Error("Erro upload original");

        // 2. Upload da Miniatura (se existir)
        if (foto.base64Mini) {
          const resMini = await fetch(foto.base64Mini);
          const blobMini = await resMini.blob();
          await supabaseClient.storage
            .from("fotos-ordens")
            .upload(nomeMini, blobMini);
        }

        // 3. Pega a URL da original para salvar no banco
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
      console.error("Falha ao sincronizar OS offline:", error);
      restantes.push(os);
    }
  }

  localStorage.setItem("@osfacil_pendentes", JSON.stringify(restantes));
  if (restantes.length === 0 && pendentes.length > 0 && mostrarToastCallback) {
    mostrarToastCallback("Dados pendentes sincronizados!", "sucesso");
  }
}
