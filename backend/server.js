/**
 * TECSAÚDE ONLINE - BACKEND API (v2.1)
 * Ajustado com validação de lista de empresas e cache inteligente.
 */

const fastify = require('fastify')({ logger: true });
const axios = require('axios');

// --- Configurações de Ambiente ---
const API_KEY = "da04510d-5822-4404-aebd-7adc197d3f42";
const PORT = process.env.PORT || 3001;

if (!API_KEY) {
  console.error('❌ ERRO: X_API_KEY não configurada.');
  process.exit(1);
}

// --- Base de Dados Interna ---
const EMPRESAS = require('./empresas');

// --- Cache e API ---
const cache = new Map();
const CACHE_TTL = 60000; // 1 minuto

const neoveroApi = axios.create({
  baseURL: 'https://tecsaude.api.neovero.com/api',
  headers: { 'X-API-KEY': API_KEY },
  timeout: 15000
});

// --- Inicialização do App ---
async function start() {
  
  // 1. CORS dinâmico
  await fastify.register(require('@fastify/cors'), {
    origin: (origin, cb) => {
      if (!origin || /localhost|vercel\.app|onrender\.com/.test(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("CORS: Acesso negado"), false);
    },
    methods: ['GET']
  });

  // 2. Rota de Listagem de Empresas (Útil para o seu Frontend montar Selects/filtros)
  fastify.get('/empresas', async () => {
    return {
      total: EMPRESAS.length,
      empresas: EMPRESAS
    };
  });

  // 3. Rota de Indicadores (Com validação da lista de empresas)
  fastify.get('/indicadores', async (request, reply) => {
    const { empresa_id, data_consolidacao_inicio, data_consolidacao_fim } = request.query;
    
    const idParaConsulta = parseInt(empresa_id) || 132; // Default se não enviado
    
    // Validação: A empresa solicitada está na nossa lista autorizada?
    // (O 132 é o seu padrão, então permitimos ele também)
    const empresaIds = EMPRESAS.map(e => e.id);
    if (!empresaIds.includes(idParaConsulta) && idParaConsulta !== 132) {
      return reply.code(403).send({ 
        error: 'Acesso negado', 
        message: `A empresa ${idParaConsulta} não está na lista permitida.` 
      });
    }

    const dataInicio = data_consolidacao_inicio || '2024-01-01T00:00';
    const cacheKey = `ind_${idParaConsulta}_${dataInicio}_${data_consolidacao_fim || 'nao'}`;

    // Verificação de Cache
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.data;
    }

    try {
      let url = `/queries/execute/indicador?empresa_id=${idParaConsulta}&data_consolidacao_inicio=${dataInicio}`;
      if (data_consolidacao_fim) url += `&data_consolidacao_fim=${data_consolidacao_fim}`;

      const response = await neoveroApi.get(url);
      
      // Salva no cache e gerencia tamanho do Map
      cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      if (cache.size > 200) cache.clear();

      return response.data;
    } catch (error) {
      fastify.log.error(error.message);
      return reply.code(error.response?.status || 500).send({ 
        error: 'Erro na API Neovero', 
        detail: error.message 
      });
    }
  });

  // 4. Rota raiz
  fastify.get('/', async () => ({ status: 'TecSaúde API Online', empresas_configuradas: EMPRESAS.length }));

  // Iniciar Servidor
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 TecSaúde Backend rodando na porta ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();