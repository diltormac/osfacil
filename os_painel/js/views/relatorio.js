// js/views/relatorio.js
import { numeroExibicao, formatarData, formatarMoeda, esc } from "../utils.js";
import { compartilharTexto } from "../compartilhamento.js";
import { toast } from "../utils.js";

export function abrirRelatorio(os) {
  if (document.getElementById("modalRelatorio")) return;

  const div = document.createElement("div");
  div.id = "modalRelatorio";
  div.className =
    "camada-modal fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4";

  // Cria a estrutura visual do Recibo
  div.innerHTML = `
    <div class="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      
      <!-- Área que será transformada em imagem -->
      <div id="relatorioCaptura" class="p-6 bg-white overflow-y-auto" style="color: #172033; font-family: sans-serif;">
        
        <div class="text-center mb-6">
          <h1 class="text-xl font-extrabold uppercase tracking-widest text-slate-800">Ordem de Serviço</h1>
          <p class="text-xs text-slate-500 mt-1">OS: ${esc(numeroExibicao(os))}</p>
          <p class="text-xs text-slate-500">Data: ${formatarData(os.created_at)}</p>
        </div>

        <div class="border-t border-b border-slate-200 py-3 mb-4 text-sm space-y-1">
          <p><strong>Cliente:</strong> ${esc(os.nome) || "Não informado"}</p>
          <p><strong>Telefone:</strong> ${esc(os.telefone) || "Não informado"}</p>
          ${os.cor ? `<p><strong>Cor:</strong> ${esc(os.cor)}</p>` : ""}
        </div>

        <table class="w-full text-left text-xs mb-4">
          <thead>
            <tr class="border-b border-slate-200 text-slate-500">
              <th class="pb-2">Serviço</th>
              <th class="pb-2 text-center">Qtd</th>
              <th class="pb-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${(os.itens_servicos || [])
              .map(
                (item) => `
              <tr class="border-b border-slate-50">
                <td class="py-2 truncate max-w-[150px]">${esc(item.servico)}</td>
                <td class="py-2 text-center">${item.quantidade || 1}</td>
                <td class="py-2 text-right">${formatarMoeda(item.valor)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        <div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg mb-4">
          <span class="font-bold text-slate-600 text-sm">TOTAL</span>
          <span class="font-extrabold text-lg text-emerald-600">${formatarMoeda(os.valor)}</span>
        </div>

        ${
          os.observacao
            ? `
          <div class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
            <strong>Obs:</strong> ${esc(os.observacao)}
          </div>
        `
            : ""
        }

        <div class="text-center mt-6 text-[10px] text-slate-400">
          <p>Obrigado pela preferência!</p>
          <p>OS Fácil - Auto Center</p>
        </div>
      </div>

      <!-- Botões de Ação -->
      <div class="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
        <button type="button" data-acao="fechar" class="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-bold transition">Fechar</button>
        <button type="button" id="btnCompartilharRelatorio" class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
          <i class="fa-solid fa-share-nodes"></i> Compartilhar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(div);

  const fechar = () => div.remove();
  div.addEventListener("click", (e) => {
    if (e.target === div) fechar();
  });
  div.querySelector('[data-acao="fechar"]').onclick = fechar;

  // Ação de Compartilhar
  div.querySelector("#btnCompartilharRelatorio").onclick = async (e) => {
    const btn = e.currentTarget;
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
    btn.disabled = true;

    try {
      const elemento = document.getElementById("relatorioCaptura");

      // Transforma o HTML em Imagem
      const canvas = await html2canvas(elemento, {
        scale: 2, // Melhor resolução
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      // Converte a imagem para DataURL (Base64)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

      // Chama a função de compartilhar que já criamos (ela aceita DataURL)
      const texto = `Segue o relatório da sua OS: ${numeroExibicao(os)}`;
      const resultado = await compartilharTexto({
        titulo: `Relatório OS ${numeroExibicao(os)}`,
        texto: texto,
        fotoUrl: dataUrl, // Passamos a imagem gerada aqui!
      });

      if (
        resultado.status === "compartilhado" ||
        resultado.status === "copiado"
      ) {
        toast("Relatório compartilhado com sucesso!");
        fechar();
      } else if (resultado.status === "erro") {
        toast("Erro ao compartilhar o relatório.", "error");
      }
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
      toast("Não foi possível gerar a imagem do relatório.", "error");
    } finally {
      btn.innerHTML = textoOriginal;
      btn.disabled = false;
    }
  };
}
