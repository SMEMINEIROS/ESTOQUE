/* ===== MODAL: CADASTRO EM LOTE DE TAMANHOS ===== */
const modalTamanhos = document.getElementById("modal-tamanhos");
const btnAbrirTamanhos = document.getElementById("btn-abrir-tamanhos");
const btnFecharTamanhos = document.getElementById("btn-fechar-tamanhos");
const btnCancelarLote = document.getElementById("btn-cancelar-lote");
const btnAddLinhaTamanho = document.getElementById("btn-add-linha-tamanho");
const formTamanhosLote = document.getElementById("form-tamanhos-lote");
const containerLinhas = document.getElementById("lote-linhas-tamanhos");
const templateLinha = document.getElementById("template-linha-tamanho");

btnAbrirTamanhos.addEventListener("click", abrirModalTamanhos);
btnFecharTamanhos.addEventListener("click", fecharModalTamanhos);
btnCancelarLote.addEventListener("click", fecharModalTamanhos);
modalTamanhos.addEventListener("click", (e) => {
  if (e.target === modalTamanhos) fecharModalTamanhos();
});

function abrirModalTamanhos() {
  formTamanhosLote.reset();
  containerLinhas.innerHTML = "";
  adicionarLinhaTamanho();
  modalTamanhos.classList.remove("oculto");
}

function fecharModalTamanhos() {
  modalTamanhos.classList.add("oculto");
}

btnAddLinhaTamanho.addEventListener("click", () => adicionarLinhaTamanho());

function adicionarLinhaTamanho() {
  const fragmento = templateLinha.content.cloneNode(true);
  const linha = fragmento.querySelector(".linha-tamanho");
  linha.querySelector(".btn-remover-linha").addEventListener("click", () => {
    if (containerLinhas.children.length > 1) {
      linha.remove();
    } else {
      mostrarFeedback("Mantenha ao menos um tamanho no lote.", "erro");
    }
  });
  containerLinhas.appendChild(linha);
}

formTamanhosLote.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = document.getElementById("lote-nome").value.trim();
  const categoria = document.getElementById("lote-categoria").value.trim();

  if (!nome || !categoria) {
    mostrarFeedback("Informe nome e categoria do produto.", "erro");
    return;
  }

  const linhas = Array.from(containerLinhas.querySelectorAll(".linha-tamanho"));
  const itens = linhas.map(linha => ({
    tamanho: linha.querySelector(".lote-tamanho-input").value.trim(),
    quantidade: Number(linha.querySelector(".lote-quantidade-input").value),
    estoqueMinimo: Number(linha.querySelector(".lote-minimo-input").value)
  }));

  const invalido = itens.some(i => !i.tamanho || i.quantidade < 0 || i.estoqueMinimo < 0);
  if (invalido) {
    mostrarFeedback("Preencha todos os tamanhos corretamente.", "erro");
    return;
  }

  const tamanhosDuplicados = itens.some(i =>
    produtosCache.some(p =>
      p.nome.toLowerCase() === nome.toLowerCase() &&
      p.categoria.toLowerCase() === categoria.toLowerCase() &&
      p.tamanho.toLowerCase() === i.tamanho.toLowerCase()
    )
  );
  if (tamanhosDuplicados) {
    mostrarFeedback("Já existe um produto cadastrado com esse nome, categoria e tamanho.", "erro");
    return;
  }

  try {
    await Promise.all(itens.map(i =>
      addDoc(produtosRef, {
        nome,
        categoria,
        tamanho: i.tamanho,
        quantidade: i.quantidade,
        estoqueMinimo: i.estoqueMinimo,
        criadoEm: serverTimestamp()
      })
    ));
    mostrarFeedback(`${itens.length} tamanho(s) cadastrado(s) com sucesso.`, "sucesso");
    fecharModalTamanhos();
  } catch (err) {
    mostrarFeedback("Erro ao salvar tamanhos: " + err.message, "erro");
  }
});
