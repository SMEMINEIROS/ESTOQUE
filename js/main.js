import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const produtosCol = collection(db, "produtos");
const movimentacoesCol = collection(db, "movimentacoes");
const kitsCol = collection(db, "kits");

let produtosCache = [];
let produtosFiltrados = [];
let movimentacoesCache = [];
let movimentacoesFiltradas = [];
let kitsCache = [];

let chartCategoriasInstance = null;
let chartMovimentacoesInstance = null;

const estadoPaginacao = {
  produtos: { atual: 1, limite: 10 },
  movimentacoes: { atual: 1, limite: 10 }
};

const feedbackGlobal = document.getElementById("feedback-global");

function mostrarFeedback(mensagem, tipo = "sucesso") {
  feedbackGlobal.textContent = mensagem;
  feedbackGlobal.className = `feedback ${tipo === "erro" ? "erro" : ""}`;
  setTimeout(() => feedbackGlobal.classList.add("oculto"), 4000);
}

function formatarData(dataISO) {
  if (!dataISO) return "";
  const partes = dataISO.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function navegarParaTela(destino) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("ativo"));
  const btnAlvo = document.querySelector(`.nav-btn[data-tela="${destino}"]`);
  if (btnAlvo) btnAlvo.classList.add("ativo");
  document.querySelectorAll("#app .tela-interna").forEach(tela => {
    tela.classList.toggle("ativa", tela.id === `tela-${destino}`);
  });
}

let listenersAtivos = false;

document.getElementById("form-login")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const erroEl = document.getElementById("login-erro");
  erroEl.textContent = "";
  
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    console.error("Falha na autenticação:", err);
    erroEl.textContent = "Credenciais inválidas. Verifique o acesso administrativo.";
  }
});

document.getElementById("btn-logout")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    mostrarFeedback("Falha ao encerrar a sessão.", "erro");
  }
});

onAuthStateChanged(auth, (user) => {
  const appEl = document.getElementById("app");
  const telaLogin = document.getElementById("tela-login");
  
  if (user) {
    telaLogin.classList.add("oculto");
    appEl.classList.remove("oculto");
    if (!listenersAtivos) {
      iniciarListeners();
      listenersAtivos = true;
    }
  } else {
    appEl.classList.add("oculto");
    telaLogin.classList.remove("oculto");
  }
});

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => navegarParaTela(btn.dataset.tela));
});

function iniciarListeners() {
  onSnapshot(query(produtosCol, orderBy("nome")), (snapshot) => {
    produtosCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    aplicarFiltrosProdutos();
    atualizarSelectsProdutos();
    atualizarSelectsKitsComponentes();
    atualizarDashboard();
  }, (err) => {
    console.error(err);
    mostrarFeedback("Erro de sincronização: Produtos.", "erro");
  });

  onSnapshot(query(movimentacoesCol, orderBy("criadoEm", "desc")), (snapshot) => {
    movimentacoesCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    aplicarFiltrosMovimentacoes();
    atualizarDashboard();
  }, (err) => {
    console.error(err);
    mostrarFeedback("Erro de sincronização: Histórico.", "erro");
  });

  onSnapshot(query(kitsCol, orderBy("nome")), (snapshot) => {
    kitsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarTabelaKits();
    atualizarSelectKitsSaida();
  }, (err) => {
    console.error(err);
    mostrarFeedback("Erro de sincronização: Kits.", "erro");
  });
}

function atualizarDashboard() {
  const totalItens = produtosCache.reduce((soma, p) => soma + p.quantidade, 0);
  const itensCriticos = produtosCache.filter(p => p.quantidade <= p.estoqueMinimo);
  
  const dataAtual = new Date();
  const mesAtual = String(dataAtual.getMonth() + 1).padStart(2, '0');
  const anoAtual = String(dataAtual.getFullYear());
  const movMes = movimentacoesCache.filter(m => m.data && m.data.startsWith(`${anoAtual}-${mesAtual}`));

  document.getElementById("kpi-total-itens").textContent = totalItens;
  document.getElementById("kpi-estoque-baixo").textContent = itensCriticos.length;
  document.getElementById("kpi-mov-mes").textContent = movMes.length;

  renderizarGraficoCategorias();
  renderizarGraficoMovimentacoes();
}

function renderizarGraficoCategorias() {
  const ctx = document.getElementById('grafico-categorias');
  if (!ctx || !window.Chart) return;

  const contagemCategorias = {};
  produtosCache.forEach(p => {
    const cat = p.categoria || 'Não Categorizado';
    contagemCategorias[cat] = (contagemCategorias[cat] || 0) + p.quantidade;
  });

  if (chartCategoriasInstance) chartCategoriasInstance.destroy();
  
  chartCategoriasInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(contagemCategorias),
      datasets: [{
        data: Object.values(contagemCategorias),
        backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
  });
}

function renderizarGraficoMovimentacoes() {
  const ctx = document.getElementById('grafico-movimentacoes');
  if (!ctx || !window.Chart) return;

  let entradas = 0, saidas = 0;
  movimentacoesCache.forEach(m => {
    if (m.tipo === 'entrada') entradas += m.quantidade;
    if (m.tipo === 'saida') saidas += m.quantidade;
  });

  if (chartMovimentacoesInstance) chartMovimentacoesInstance.destroy();
  
  chartMovimentacoesInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Reposição (Entrada)', 'Distribuição (Saída)'],
      datasets: [{
        data: [entradas, saidas],
        backgroundColor: ['#10b981', '#f59e0b']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

document.getElementById('btn-busca-global-prod')?.addEventListener('click', () => {
  const termo = document.getElementById('busca-global').value;
  document.getElementById('busca-produto').value = termo;
  aplicarFiltrosProdutos();
  navegarParaTela('produtos');
});

document.getElementById('btn-busca-global-mov')?.addEventListener('click', () => {
  const termo = document.getElementById('busca-global').value;
  document.getElementById('busca-texto').value = termo;
  aplicarFiltrosMovimentacoes();
  navegarParaTela('movimentacoes');
});

document.getElementById('btn-exportar-pdf')?.addEventListener('click', () => {
  if (!window.jspdf) return mostrarFeedback("Falha ao injetar gerador de PDF.", "erro");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(16); 
  doc.text("Secretaria Municipal de Educação", 14, 20);
  doc.setFontSize(12); 
  doc.text("Auditoria Mensal de Distribuição", 14, 28);
  doc.setFontSize(10); 
  doc.text(`Extração realizada em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);

  const corpoTabela = movimentacoesFiltradas.map(m => [
    formatarData(m.data), 
    m.tipo === "entrada" ? "Entrada" : "Saída", 
    m.produtoNome, 
    m.quantidade, 
    m.retiradoPor || "-"
  ]);

  doc.autoTable({ 
    startY: 40, 
    head: [['Data', 'Fluxo', 'Referência', 'Vol.', 'Destino']], 
    body: corpoTabela, 
    theme: 'striped', 
    headStyles: { fillColor: [15, 23, 42] }
  });
  
  doc.save("auditoria-distribuicao-sme.pdf");
});

const formProduto = document.getElementById("form-produto");
formProduto?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("produto-id").value;
  const payload = {
    nome: document.getElementById("produto-nome").value.trim(),
    categoria: document.getElementById("produto-categoria").value.trim(),
    tamanho: document.getElementById("produto-tamanho").value.trim(),
    quantidade: Number(document.getElementById("produto-quantidade").value),
    estoqueMinimo: Number(document.getElementById("produto-minimo").value)
  };

  try {
    if (id) { 
      await updateDoc(doc(db, "produtos", id), payload); 
      mostrarFeedback("Matriz de produto atualizada."); 
    } else { 
      await addDoc(produtosCol, { ...payload, criadoEm: serverTimestamp() }); 
      mostrarFeedback("Novo material inserido no catálogo."); 
    }
    limparFormularioProduto();
  } catch (err) { 
    console.error("Erro na gravação do produto:", err);
    mostrarFeedback("Falha na persistência dos dados.", "erro"); 
  }
});

function limparFormularioProduto() {
  formProduto.reset(); 
  document.getElementById("produto-id").value = "";
  document.getElementById("btn-salvar-produto").textContent = "Salvar Material";
  document.getElementById("btn-cancelar-edicao").classList.add("oculto");
}

document.getElementById("btn-cancelar-edicao")?.addEventListener("click", limparFormularioProduto);

window.editarProduto = function(id) {
  const p = produtosCache.find(x => x.id === id); 
  if (!p) return;
  document.getElementById("produto-id").value = p.id;
  document.getElementById("produto-nome").value = p.nome;
  document.getElementById("produto-categoria").value = p.categoria;
  document.getElementById("produto-tamanho").value = p.tamanho;
  document.getElementById("produto-quantidade").value = p.quantidade;
  document.getElementById("produto-minimo").value = p.estoqueMinimo;
  document.getElementById("btn-salvar-produto").textContent = "Gravar Alterações";
  document.getElementById("btn-cancelar-edicao").classList.remove("oculto");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.excluirProduto = async function(id) {
  if (!confirm("Confirmar a exclusão permanente deste material?")) return;
  try { 
    await deleteDoc(doc(db, "produtos", id)); 
    mostrarFeedback("Remoção efetivada."); 
  } catch (err) { 
    console.error("Erro na deleção:", err);
    mostrarFeedback("Erro de permissão ao excluir.", "erro"); 
  }
};

function aplicarFiltrosProdutos() {
  const termo = document.getElementById("busca-produto")?.value.toLowerCase() || "";
  produtosFiltrados = produtosCache.filter(p => 
    p.nome.toLowerCase().includes(termo) || 
    p.categoria.toLowerCase().includes(termo) || 
    p.tamanho.toLowerCase().includes(termo)
  );
  estadoPaginacao.produtos.atual = 1; 
  renderizarTabelaProdutos();
}

document.getElementById("busca-produto")?.addEventListener("input", aplicarFiltrosProdutos);

function renderizarTabelaProdutos() {
  const tbody = document.getElementById("tbody-produtos"); 
  if (!tbody) return;
  const { atual, limite } = estadoPaginacao.produtos;
  const inicio = (atual - 1) * limite;
  
  tbody.innerHTML = produtosFiltrados.slice(inicio, inicio + limite).map(p => `<tr>
    <td><strong>${p.nome}</strong></td>
    <td>${p.categoria}</td>
    <td>${p.tamanho}</td>
    <td>${p.quantidade}</td>
    <td>${p.estoqueMinimo}</td>
    <td>
      <button class="acao-editar" onclick="editarProduto('${p.id}')">Editar</button>
      <button class="acao-excluir" onclick="excluirProduto('${p.id}')">Excluir</button>
    </td>
  </tr>`).join("");

  const totalPaginas = Math.ceil(produtosFiltrados.length / limite) || 1;
  const info = document.getElementById("info-pagina-prod");
  if (info) info.textContent = `Página ${atual} de ${totalPaginas}`;
  document.getElementById("btn-prev-prod").disabled = atual === 1;
  document.getElementById("btn-next-prod").disabled = atual === totalPaginas;
}

document.getElementById("btn-prev-prod")?.addEventListener("click", () => { 
  if (estadoPaginacao.produtos.atual > 1) { 
    estadoPaginacao.produtos.atual--; 
    renderizarTabelaProdutos(); 
  } 
});

document.getElementById("btn-next-prod")?.addEventListener("click", () => { 
  if (estadoPaginacao.produtos.atual < Math.ceil(produtosFiltrados.length / estadoPaginacao.produtos.limite)) { 
    estadoPaginacao.produtos.atual++; 
    renderizarTabelaProdutos(); 
  } 
});

const modalKit = document.getElementById("modal-criacao-kit");
const containerLinhasKit = document.getElementById("kit-linhas-componentes");
const templateLinhaKit = document.getElementById("template-linha-componente");

document.getElementById("btn-abrir-modal-kit")?.addEventListener("click", () => { 
  document.getElementById("form-criacao-kit").reset(); 
  containerLinhasKit.innerHTML = ""; 
  adicionarLinhaKit(); 
  modalKit.classList.remove("oculto"); 
});

const fecharModalKit = () => modalKit.classList.add("oculto");

document.getElementById("btn-fechar-modal-kit")?.addEventListener("click", fecharModalKit);
document.getElementById("btn-cancelar-criacao-kit")?.addEventListener("click", fecharModalKit);

function atualizarSelectsKitsComponentes() {
  const opcoes = produtosCache.map(p => `<option value="${p.id}">${p.nome} - ${p.tamanho}</option>`).join("");
  containerLinhasKit.querySelectorAll(".comp-produto-input").forEach(select => { 
    const val = select.value; 
    select.innerHTML = opcoes; 
    if (val) select.value = val; 
  });
}

function atualizarSelectKitsSaida() {
  const select = document.getElementById("saida-kit"); 
  if(select) {
    select.innerHTML = kitsCache.map(k => `<option value="${k.id}">${k.nome}</option>`).join("");
  }
}

function adicionarLinhaKit() {
  const linha = templateLinhaKit.content.cloneNode(true).querySelector(".linha-componente");
  linha.querySelector(".comp-produto-input").innerHTML = produtosCache.map(p => `<option value="${p.id}">${p.nome} - ${p.tamanho}</option>`).join("");
  linha.querySelector(".btn-remover-linha").addEventListener("click", () => { 
    if (containerLinhasKit.children.length > 1) linha.remove(); 
  });
  containerLinhasKit.appendChild(linha);
}

document.getElementById("btn-add-linha-kit")?.addEventListener("click", adicionarLinhaKit);

document.getElementById("form-criacao-kit")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("kit-nome").value.trim();
  const componentes = Array.from(containerLinhasKit.querySelectorAll(".linha-componente")).map(l => ({ 
    produtoId: l.querySelector(".comp-produto-input").value, 
    quantidade: Number(l.querySelector(".comp-quantidade-input").value) 
  }));
  
  try { 
    await addDoc(kitsCol, { nome, componentes, criadoEm: serverTimestamp() }); 
    mostrarFeedback("Composição de kit homologada."); 
    fecharModalKit(); 
  } catch (err) { 
    console.error("Erro na criação do kit:", err); 
    mostrarFeedback(`Obstrução no servidor: ${err.message}`, "erro"); 
  }
});

function renderizarTabelaKits() {
  const tbody = document.getElementById("tbody-kits"); 
  if (!tbody) return;
  
  tbody.innerHTML = kitsCache.map(k => {
    const compNomes = k.componentes.map(c => { 
      const p = produtosCache.find(prod => prod.id === c.produtoId); 
      return p ? `${c.quantidade}x ${p.nome} (${p.tamanho})` : 'Item obsoleto'; 
    }).join('<br>');
    return `<tr><td><strong>${k.nome}</strong></td><td><small>${compNomes}</small></td><td><button class="acao-excluir" onclick="excluirKit('${k.id}')">Excluir</button></td></tr>`;
  }).join("");
}

window.excluirKit = async function(id) { 
  if (!confirm("Descartar estrutura do kit?")) return; 
  try { 
    await deleteDoc(doc(db, "kits", id)); 
    mostrarFeedback("Estrutura descartada."); 
  } catch (err) { 
    console.error("Erro ao deletar kit:", err);
    mostrarFeedback("Falha de rede ao excluir.", "erro"); 
  } 
};

function atualizarSelectsProdutos() {
  const opcoes = produtosCache.map(p => `<option value="${p.id}">${p.nome} - ${p.categoria} - ${p.tamanho}</option>`).join("");
  ["entrada-produto", "saida-produto", "filtro-produto"].forEach(id => { 
    const el = document.getElementById(id); 
    if (el) el.innerHTML = id === "filtro-produto" ? `<option value="">Todo o inventário</option>${opcoes}` : opcoes; 
  });
}

document.querySelectorAll('input[name="tipo-saida"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const isKit = e.target.value === 'kit';
    document.getElementById("container-saida-produto").classList.toggle("oculto", isKit); 
    document.getElementById("saida-produto").required = !isKit;
    document.getElementById("container-saida-kit").classList.toggle("oculto", !isKit); 
    document.getElementById("saida-kit").required = isKit;
  });
});

document.getElementById("form-entrada")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const produtoId = document.getElementById("entrada-produto").value;
  const quantidade = Number(document.getElementById("entrada-quantidade").value);
  const data = document.getElementById("entrada-data").value;
  const obs = document.getElementById("entrada-obs").value.trim();
  
  const produto = produtosCache.find(p => p.id === produtoId); 
  if (!produto) return;
  
  try {
    await updateDoc(doc(db, "produtos", produtoId), { quantidade: produto.quantidade + quantidade });
    await addDoc(movimentacoesCol, { 
      tipo: "entrada", 
      produtoId, 
      produtoNome: `${produto.nome} (${produto.tamanho})`, 
      quantidade, 
      data, 
      obs, 
      criadoEm: serverTimestamp() 
    });
    mostrarFeedback("Reposição confirmada."); 
    e.target.reset();
  } catch (err) { 
    console.error("Erro ao registrar entrada:", err);
    mostrarFeedback("Erro na conciliação do banco de dados.", "erro"); 
  }
});

document.getElementById("form-saida")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipoSaida = document.querySelector('input[name="tipo-saida"]:checked').value;
  const quantidade = Number(document.getElementById("saida-quantidade").value);
  const data = document.getElementById("saida-data").value;
  const retiradoPor = document.getElementById("saida-retirado-por").value.trim();
  const obs = document.getElementById("saida-obs").value.trim();

  if (tipoSaida === "produto") {
    const produtoId = document.getElementById("saida-produto").value;
    const produto = produtosCache.find(p => p.id === produtoId);
    
    if (!produto || quantidade > produto.quantidade) return mostrarFeedback("Estoque insuficiente.", "erro");
    
    try {
      await updateDoc(doc(db, "produtos", produtoId), { quantidade: produto.quantidade - quantidade });
      await addDoc(movimentacoesCol, { 
        tipo: "saida", 
        produtoId, 
        produtoNome: `${produto.nome} (${produto.tamanho})`, 
        quantidade, 
        data, 
        retiradoPor, 
        obs, 
        criadoEm: serverTimestamp() 
      });
      mostrarFeedback("Distribuição avulsa lançada."); 
      e.target.reset();
    } catch (err) { 
      console.error("Erro na saída avulsa:", err);
      mostrarFeedback("Falha no commit da transação.", "erro"); 
    }
  } else {
    const kit = kitsCache.find(k => k.id === document.getElementById("saida-kit").value); 
    if (!kit) return;
    
    const operacoes = [];
    const errosEstoque = [];
    
    for (let comp of kit.componentes) {
      const p = produtosCache.find(x => x.id === comp.produtoId);
      const qtdNecessaria = comp.quantidade * quantidade;
      if (!p || p.quantidade < qtdNecessaria) {
        errosEstoque.push(`${p ? p.nome : 'Item'} (Faltam ${qtdNecessaria - (p?.quantidade || 0)})`);
      } else {
        operacoes.push({ ref: doc(db, "produtos", p.id), novaQtd: p.quantidade - qtdNecessaria });
      }
    }
    
    if (errosEstoque.length > 0) return mostrarFeedback(`Bloqueio: Saldo insuficiente para: ${errosEstoque.join(', ')}`, "erro");
    
    try {
      const batch = writeBatch(db);
      operacoes.forEach(op => batch.update(op.ref, { quantidade: op.novaQtd }));
      batch.set(doc(collection(db, "movimentacoes")), { 
        tipo: "saida", 
        produtoNome: `KIT: ${kit.nome}`, 
        quantidade, 
        data, 
        retiradoPor, 
        obs, 
        criadoEm: serverTimestamp(), 
        isKit: true, 
        componentesBaixados: kit.componentes 
      });
      
      await batch.commit(); 
      mostrarFeedback(`Lote de ${quantidade} kits processado via batch.`); 
      e.target.reset();
    } catch (err) { 
      console.error("Erro no batch do kit:", err);
      mostrarFeedback("Erro crítico na transação atômica.", "erro"); 
    }
  }
});

function aplicarFiltrosMovimentacoes() {
  const termo = document.getElementById("busca-texto")?.value.toLowerCase() || "";
  const data = document.getElementById("busca-data")?.value || "";
  const tipo = document.getElementById("filtro-tipo")?.value || "";
  const produtoId = document.getElementById("filtro-produto")?.value || "";
  
  movimentacoesFiltradas = movimentacoesCache.filter(m => 
    (m.produtoNome.toLowerCase().includes(termo) || (m.retiradoPor || "").toLowerCase().includes(termo)) && 
    (!data || m.data === data) && 
    (!tipo || m.tipo === tipo) && 
    (!produtoId || m.produtoId === produtoId)
  );
  
  estadoPaginacao.movimentacoes.atual = 1; 
  renderizarTabelaMovimentacoes();
}

["busca-texto", "busca-data", "filtro-tipo", "filtro-produto"].forEach(id => { 
  document.getElementById(id)?.addEventListener("input", aplicarFiltrosMovimentacoes); 
});

function renderizarTabelaMovimentacoes() {
  const tbody = document.getElementById("tbody-movimentacoes"); 
  if (!tbody) return;
  
  const { atual, limite } = estadoPaginacao.movimentacoes;
  const inicio = (atual - 1) * limite;
  
  tbody.innerHTML = movimentacoesFiltradas.slice(inicio, inicio + limite).map(m => `<tr>
    <td>${formatarData(m.data)}</td>
    <td>${m.tipo === "entrada" ? "Reposição" : "Distribuição"}</td>
    <td><strong>${m.produtoNome}</strong></td>
    <td>${m.quantidade}</td>
    <td>${m.retiradoPor || "-"}</td>
    <td>${m.obs || "-"}</td>
  </tr>`).join("");
  
  const info = document.getElementById("info-pagina-mov"); 
  const totalPaginas = Math.ceil(movimentacoesFiltradas.length / limite) || 1;
  
  if (info) info.textContent = `Página ${atual} de ${totalPaginas}`;
  document.getElementById("btn-prev-mov").disabled = atual === 1; 
  document.getElementById("btn-next-mov").disabled = atual === totalPaginas;
}

document.getElementById("btn-prev-mov")?.addEventListener("click", () => { 
  if (estadoPaginacao.movimentacoes.atual > 1) { 
    estadoPaginacao.movimentacoes.atual--; 
    renderizarTabelaMovimentacoes(); 
  } 
});

document.getElementById("btn-next-mov")?.addEventListener("click", () => { 
  if (estadoPaginacao.movimentacoes.atual < Math.ceil(movimentacoesFiltradas.length / estadoPaginacao.movimentacoes.limite)) { 
    estadoPaginacao.movimentacoes.atual++; 
    renderizarTabelaMovimentacoes(); 
  } 
});

const modalTamanhos = document.getElementById("modal-tamanhos");
const containerLinhasTamanhos = document.getElementById("lote-linhas-tamanhos");
const templateLinhaTamanho = document.getElementById("template-linha-tamanho");

document.getElementById("btn-abrir-tamanhos")?.addEventListener("click", () => { 
  document.getElementById("form-tamanhos-lote").reset(); 
  containerLinhasTamanhos.innerHTML = ""; 
  adicionarLinhaTamanho(); 
  modalTamanhos.classList.remove("oculto"); 
});

const fecharModalTamanhos = () => modalTamanhos.classList.add("oculto"); 

document.getElementById("btn-fechar-tamanhos")?.addEventListener("click", fecharModalTamanhos); 
document.getElementById("btn-cancelar-lote")?.addEventListener("click", fecharModalTamanhos);

function adicionarLinhaTamanho() { 
  const linha = templateLinhaTamanho.content.cloneNode(true).querySelector(".linha-tamanho"); 
  linha.querySelector(".btn-remover-linha").addEventListener("click", () => { 
    if (containerLinhasTamanhos.children.length > 1) linha.remove(); 
  }); 
  containerLinhasTamanhos.appendChild(linha); 
}

document.getElementById("btn-add-linha-tamanho")?.addEventListener("click", adicionarLinhaTamanho);

document.getElementById("form-tamanhos-lote")?.addEventListener("submit", async (e) => { 
  e.preventDefault(); 
  const nome = document.getElementById("lote-nome").value.trim();
  const categoria = document.getElementById("lote-categoria").value.trim();
  const itens = Array.from(containerLinhasTamanhos.querySelectorAll(".linha-tamanho")).map(l => ({ 
    tamanho: l.querySelector(".lote-tamanho-input").value.trim(), 
    quantidade: Number(l.querySelector(".lote-quantidade-input").value), 
    estoqueMinimo: Number(l.querySelector(".lote-minimo-input").value) 
  })); 
  
  try { 
    await Promise.all(itens.map(i => addDoc(produtosCol, { 
      nome, 
      categoria, 
      tamanho: i.tamanho, 
      quantidade: i.quantidade, 
      estoqueMinimo: i.estoqueMinimo, 
      criadoEm: serverTimestamp() 
    }))); 
    mostrarFeedback("Lote importado."); 
    fecharModalTamanhos(); 
  } catch (err) { 
    console.error("Erro no lote:", err);
    mostrarFeedback("Falha no parse do lote.", "erro"); 
  } 
});
