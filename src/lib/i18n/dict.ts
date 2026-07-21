/**
 * Diccionarios de traducción — inicial minimal (es / pt-BR).
 *
 * Reglas:
 *   - La CLAVE es siempre en español (idioma canónico del código).
 *   - Si falta traducción, se devuelve la clave española.
 *   - Interpolación simple con {var}: t("hola {n}", { n: 5 }) →
 *     "hola 5" / "olá 5".
 *
 * A medida que se traducen más pantallas, se agregan claves acá. Evitar
 * traducir todo el texto libre — solo lo user-facing.
 */

export type Lang = "es" | "pt-BR" | "en";

type Dict = Record<string, string>;

const es: Dict = {
  // Sidebar / menús
  "Caja": "Caja",
  "Clientes": "Clientes",
  "Inventario": "Inventario",
  "Compras": "Compras",
  "Productos": "Productos",
  "Movimientos": "Movimientos",
  "Transferencias": "Transferencias",
  "Categorías": "Categorías",
  "Proveedores": "Proveedores",
  "Órdenes de compra": "Órdenes de compra",
  "Buscar…": "Buscar…",
  "Cerrar sesión": "Cerrar sesión",
  "Notificaciones": "Notificaciones",

  // Header
  "Admin": "Admin",
  "Usuario": "Usuario",
  "Supervisor": "Supervisor",

  // Caja
  "Cargá lo que el cliente trae y lo que lleva. El sistema calcula el resto.":
    "Cargá lo que el cliente trae y lo que lleva. El sistema calcula el resto.",
  "CAJA ABIERTA": "CAJA ABIERTA",
  "CAJA CERRADA": "CAJA CERRADA",
  "Monto inicial": "Monto inicial",
  "desde": "desde",
  "Movimiento": "Movimiento",
  "Cerrar caja": "Cerrar caja",
  "Abrir caja": "Abrir caja",
  "Historial": "Historial",
  "Abrí la caja para poder registrar atenciones.": "Abrí la caja para poder registrar atenciones.",
  "pendiente": "pendiente",
  "pendientes": "pendientes",
  "CLIENTE": "CLIENTE",
  "Buscar por nombre o RUC…": "Buscar por nombre o RUC…",
  "EL CLIENTE TRAE": "EL CLIENTE TRAE",
  "EL CLIENTE LLEVA": "EL CLIENTE LLEVA",
  "Cargá las prendas que entrega para acreditar.": "Cargá las prendas que entrega para acreditar.",
  "Cargá las prendas que se lleva de la tienda.": "Cargá las prendas que se lleva de la tienda.",
  "SUBTOTAL": "SUBTOTAL",
  "TOTAL": "TOTAL",
  "Cambio directo": "Cambio directo",
  "Carga rápida": "Carga rápida",
  "Confirmar atención": "Confirmar atención",
  "Registrando…": "Registrando…",
  "Limpiar": "Limpiar",
  "Cancelar": "Cancelar",
  "Observaciones (opcional)": "Observaciones (opcional)",
  "Notas de la atención": "Notas de la atención",

  // Alertas comunes
  "No pudimos confirmar la atención": "No pudimos confirmar la atención",
  "No hay stock suficiente para cerrar la venta": "No hay stock suficiente para cerrar la venta",
  "Cerrar aviso": "Cerrar aviso",

  // Meta alcanzada
  "¡Felicidades!": "¡Felicidades!",
  "alcanzó el": "alcanzó el",
  "de la meta del día.": "de la meta del día.",
  "recepción pendiente de evaluar": "recepción pendiente de evaluar",
  "recepciones pendientes de evaluar": "recepciones pendientes de evaluar",
  "Hay bolsas esperando ser ingresadas al stock.": "Hay bolsas esperando ser ingresadas al stock.",
  "Ir a la bandeja": "Ir a la bandeja",
  "Ir a la bandeja de pendientes": "Ir a la bandeja de pendientes",
  "Todo al día, sin pendientes.": "Todo al día, sin pendientes.",

  // Genéricos
  // Inventario
  "Gestión de productos y control de stock": "Gestión de productos y control de stock",
  "Total productos": "Total productos",
  "Stock valorizado": "Stock valorizado",
  "Stock bajo": "Stock bajo",
  "Con stock disponible": "Con stock disponible",
  "Reventa": "Reventa",
  "stock × costo prom.": "stock × costo prom.",
  "≤ stock mínimo": "≤ stock mínimo",
  "stock > 0": "stock > 0",
  "Nuevo producto": "Nuevo producto",
  "Administrar categorías": "Administrar categorías",
  "Buscar por nombre...": "Buscar por nombre...",
  "Stock: todos": "Stock: todos",
  "Con stock (>0)": "Con stock (>0)",
  "Sin stock (=0)": "Sin stock (=0)",
  "Stock bajo (≤ mín.)": "Stock bajo (≤ mín.)",
  "Sin proveedores cargados": "Sin proveedores cargados",
  "Proveedor: todos": "Proveedor: todos",
  "Limpiar filtros": "Limpiar filtros",
  "Nombre": "Nombre",
  "Categoría": "Categoría",
  "Costo Prom.": "Costo Prom.",
  "Precio Venta": "Precio Venta",
  "Stock actual": "Stock actual",
  "Sucursal": "Sucursal",
  "Stock Mín.": "Stock Mín.",
  "Margen s/venta": "Margen s/venta",
  "Acción": "Acción",
  "Todavía no cargaste productos. Probá con \"+ Nuevo producto\" o \"Importar Excel\".":
    "Todavía no cargaste productos. Probá con \"+ Nuevo producto\" o \"Importar Excel\".",
  "Exportar Excel": "Exportar Excel",

  "Sí": "Sí",
  "No": "No",
  "Guardar": "Guardar",
  "Editar": "Editar",
  "Nuevo": "Nuevo",
  "Volver": "Volver",
  "Ver todos": "Ver todos",
  "hace {n}h": "hace {n}h",
  "hace {n}d": "hace {n}d",
};

const ptBR: Dict = {
  // Sidebar / menús
  "Caja": "Caixa",
  "Clientes": "Clientes",
  "Inventario": "Estoque",
  "Compras": "Compras",
  "Productos": "Produtos",
  "Movimientos": "Movimentos",
  "Transferencias": "Transferências",
  "Categorías": "Categorias",
  "Proveedores": "Fornecedores",
  "Órdenes de compra": "Ordens de compra",
  "Buscar…": "Buscar…",
  "Cerrar sesión": "Sair",
  "Notificaciones": "Notificações",

  // Header
  "Admin": "Admin",
  "Usuario": "Usuário",
  "Supervisor": "Supervisor",

  // Caja
  "Cargá lo que el cliente trae y lo que lleva. El sistema calcula el resto.":
    "Registre o que o cliente traz e o que leva. O sistema calcula o resto.",
  "CAJA ABIERTA": "CAIXA ABERTO",
  "CAJA CERRADA": "CAIXA FECHADO",
  "Monto inicial": "Valor inicial",
  "desde": "desde",
  "Movimiento": "Movimento",
  "Cerrar caja": "Fechar caixa",
  "Abrir caja": "Abrir caixa",
  "Historial": "Histórico",
  "Abrí la caja para poder registrar atenciones.": "Abra o caixa para poder registrar atendimentos.",
  "pendiente": "pendente",
  "pendientes": "pendentes",
  "CLIENTE": "CLIENTE",
  "Buscar por nombre o RUC…": "Buscar por nome ou CPF/CNPJ…",
  "EL CLIENTE TRAE": "O CLIENTE TRAZ",
  "EL CLIENTE LLEVA": "O CLIENTE LEVA",
  "Cargá las prendas que entrega para acreditar.": "Registre as peças que ele entrega para creditar.",
  "Cargá las prendas que se lleva de la tienda.": "Registre as peças que ele leva da loja.",
  "SUBTOTAL": "SUBTOTAL",
  "TOTAL": "TOTAL",
  "Cambio directo": "Troca direta",
  "Carga rápida": "Carga rápida",
  "Confirmar atención": "Confirmar atendimento",
  "Registrando…": "Registrando…",
  "Limpiar": "Limpar",
  "Cancelar": "Cancelar",
  "Observaciones (opcional)": "Observações (opcional)",
  "Notas de la atención": "Notas do atendimento",

  // Alertas comunes
  "No pudimos confirmar la atención": "Não foi possível confirmar o atendimento",
  "No hay stock suficiente para cerrar la venta": "Não há estoque suficiente para fechar a venda",
  "Cerrar aviso": "Fechar aviso",

  // Meta alcanzada
  "¡Felicidades!": "Parabéns!",
  "alcanzó el": "alcançou",
  "de la meta del día.": "da meta do dia.",
  "recepción pendiente de evaluar": "recepção pendente de avaliação",
  "recepciones pendientes de evaluar": "recepções pendentes de avaliação",
  "Hay bolsas esperando ser ingresadas al stock.": "Há sacolas esperando entrar no estoque.",
  "Ir a la bandeja": "Ir para a caixa de entrada",
  "Ir a la bandeja de pendientes": "Ir para os pendentes",
  "Todo al día, sin pendientes.": "Tudo em dia, sem pendências.",

  // Genéricos
  // Inventario
  "Gestión de productos y control de stock": "Gestão de produtos e controle de estoque",
  "Total productos": "Total de produtos",
  "Stock valorizado": "Estoque valorizado",
  "Stock bajo": "Estoque baixo",
  "Con stock disponible": "Com estoque disponível",
  "Reventa": "Revenda",
  "stock × costo prom.": "estoque × custo méd.",
  "≤ stock mínimo": "≤ estoque mínimo",
  "stock > 0": "estoque > 0",
  "Nuevo producto": "Novo produto",
  "Administrar categorías": "Gerenciar categorias",
  "Buscar por nombre...": "Buscar por nome...",
  "Stock: todos": "Estoque: todos",
  "Con stock (>0)": "Com estoque (>0)",
  "Sin stock (=0)": "Sem estoque (=0)",
  "Stock bajo (≤ mín.)": "Estoque baixo (≤ mín.)",
  "Sin proveedores cargados": "Sem fornecedores cadastrados",
  "Proveedor: todos": "Fornecedor: todos",
  "Limpiar filtros": "Limpar filtros",
  "Nombre": "Nome",
  "Categoría": "Categoria",
  "Costo Prom.": "Custo Méd.",
  "Precio Venta": "Preço de Venda",
  "Stock actual": "Estoque atual",
  "Sucursal": "Filial",
  "Stock Mín.": "Estoque Mín.",
  "Margen s/venta": "Margem s/venda",
  "Acción": "Ação",
  "Todavía no cargaste productos. Probá con \"+ Nuevo producto\" o \"Importar Excel\".":
    "Ainda não cadastrou produtos. Tente '+ Novo produto' ou 'Importar Excel'.",
  "Exportar Excel": "Exportar Excel",

  "Sí": "Sim",
  "No": "Não",
  "Guardar": "Salvar",
  "Editar": "Editar",
  "Nuevo": "Novo",
  "Volver": "Voltar",
  "Ver todos": "Ver todos",
  "hace {n}h": "há {n}h",
  "hace {n}d": "há {n}d",
};

const dicts: Record<Lang, Dict> = { "es": es, "pt-BR": ptBR, "en": es };

export function translate(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const d = dicts[lang] ?? dicts.es;
  let raw = d[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      raw = raw.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return raw;
}
