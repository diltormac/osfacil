export function comprimirImagemWeb(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(arquivo);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // 1. Gera a Imagem Original (Máx 1024px)
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

            // 2. Gera a Miniatura (Máx 300px)
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
                const nomeMini = arquivo.name.replace(
                  /\.[^/.]+$/,
                  "_thumb.jpg",
                );
                const fileMini = new File([blobMini], nomeMini, {
                  type: "image/jpeg",
                });

                // Retorna as duas versões
                resolve({ original: fileOriginal, miniatura: fileMini });
              },
              "image/jpeg",
              0.6,
            );
          },
          "image/jpeg",
          0.7,
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}
