/**
 * TECSAÚDE ONLINE - BACKEND API (v2.1)
 * Ajustado com validação de lista de empresas e cache inteligente.
 */

const fastify = require('fastify')({ logger: true });
const axios = require('axios');

// --- Configurações de Ambiente ---
const API_KEY = process.env.X_API_KEY;
const PORT = process.env.PORT || 3001;

if (!API_KEY) {
  console.error('❌ ERRO: X_API_KEY não configurada.');
  process.exit(1);
}

// --- Base de Dados Interna ---
const EMPRESAS = [
  { id: 157, nome: 'MEDRADIUS' },
  { id: 241, nome: 'HOSPITAL UNIVERSITÁRIO PROFESSOR ALBERTO ANTUNES – HUPAA' },
  { id: 153, nome: 'OZN HEALTH SPE S.A. (HOSPITAL DELPHINA RINALDI)' },
  { id: 232, nome: 'UPA CAMPOS SALLES' },
  { id: 88, nome: 'HOSPITAL ARISTIDES MALTEZ' },
  { id: 128, nome: 'CENTRO MÉDICO HOSPITALAR AGENOR PAIVA' },
  { id: 252, nome: 'HOEB - HOSPITAL ORTOPÉDICO DO ESTADO DA BAHIA' },
  { id: 223, nome: 'HOSPITAL DAS CLÍNICAS DE ALAGOINHAS' },
  { id: 177, nome: 'POLICLÍNICA PASSARÉ E POLICLÍNICA BONSUCESSO' },
  { id: 247, nome: 'SUPORTE NUTRICIONAL E QUIMIOTERAPIA LTDA' },
  { id: 175, nome: 'HOSPITAL GERAL DE FORTALEZA-HGF' },
  { id: 14, nome: 'UNIMED FORTALEZA' },
  { id: 220, nome: 'HOME- HOSPITAL ORTOPÉDICO E MEDICINA ESPECIALIZADA LTDA' },
  { id: 186, nome: 'EBEM - FAG DE OLIVEIRA EPP' },
  { id: 197, nome: 'FUNDAÇÃO ALTINO VENTURA' },
  { id: 196, nome: 'GRUPO SANTA MARTA' },
  { id: 188, nome: 'HOSPITAL AGAMENON MAGALHÃES' },
  { id: 198, nome: 'HOSPITAL DA AERONÁUTICA DO RECIFE' },
  { id: 200, nome: 'HOSPITAL UNIVERSITÁRIO DE BRASÍLIA' },
  { id: 199, nome: 'IMAGENS MÉDICAS BRASÍLIA' },
  { id: 244, nome: 'HOSPITAL DE PLÁSTICA' },
  { id: 133, nome: 'HOSPITAL SÃO JOSÉ - COLATINA' },
  { id: 25, nome: 'VITÓRIA APART HOSPITAL' },
  { id: 217, nome: 'SANTA CASA DE MISERICÓRDIA DE COLATINA' },
  { id: 60, nome: 'UNIMED NOROESTE CAPIXABA' },
  { id: 20, nome: 'UNIMED VITÓRIA' },
  { id: 143, nome: 'CENTRAL COMPARTILHADA DE OPERAÇÕES' },
  { id: 249, nome: 'CENTRAL COMPARTILHADA DE OPERAÇÕES - SP' },
  { id: 17, nome: 'TECSAÚDE' },
  { id: 256, nome: 'HOSPITAL ESTADUAL DE URGÊNCIAS DE GOIÁS DR. VALDEMIRO CRUZ' },
  { id: 236, nome: 'HOSPITAL MUNICIPAL DE APARECIDA DE GOIÂNIA' },
  { id: 181, nome: 'HOSPITAL MARANHENSE' },
  { id: 209, nome: 'HOSPITAL SANTA MÔNICA DE IMPERATRIZ' },
  { id: 172, nome: 'UNIMED IMPERATRIZ DO MARANHÃO' },
  { id: 259, nome: 'HOSPITAL DAS CLINICAS - UFTM' },
  { id: 260, nome: 'GESTÃO DA QUALIDADE  -  DTQ' },
  { id: 179, nome: 'COMPLEXO HOSPITALAR UNIVERSITARIO DA UFPA' },
  { id: 127, nome: 'DIAGNOSIS CENTRO DE DIAGNOSTICOS LTDA - HSM' },
  { id: 38, nome: 'HOSPITAL REGIONAL PUBLICO DO MARAJÓ' },
  { id: 215, nome: 'HOSPITAL REGIONAL PÚBLICO DOS CAETÉS' },
  { id: 95, nome: 'UNIMED JOÃO PESSOA COOPERATIVA DE TRABALHO MÉDICO' },
  { id: 18, nome: 'IMIP - INSTITUTO DE MEDICINA INTEGRAL PROF. FERNANDO FIGUEIRA' },
  { id: 70, nome: 'UPAE' },
  { id: 69, nome: 'UPAE GARANHUNS' },
  { id: 160, nome: 'HOSPITAL DE CÂNCER DE PERNAMBUCO' },
  { id: 161, nome: 'HOSPITAL MED IMAGEM' },
  { id: 242, nome: 'TECSAÚDE LOCAÇÃO' },
  { id: 100, nome: 'HCP GESTÃO' },
  { id: 8, nome: 'HEMOPE' },
  { id: 139, nome: 'HOSPITAL DA RESTAURAÇÃO GOV. PAULO GUERRA' },
  { id: 158, nome: 'HOSPITAL UNIVERSITÁRIO OSWALDO CRUZ' },
  { id: 183, nome: 'SANTA CASA DE MISERICORDIA DO RECIFE' },
  { id: 159, nome: 'HOSPITAL GERAL MATERNO INFANTIL - UNIMED RECIFE' },
  { id: 11, nome: 'HOSPITAL UNIMED RECIFE' },
  { id: 115, nome: 'HOSPITAL DAS CLÍNICAS DE TERESÓPOLIS COSTANTINO OTTAVIANO' },
  { id: 254, nome: 'HOSPITAL DO CORACAO DE NATAL' },
  { id: 180, nome: 'HOSPITAL MILITAR DE ÁREA DE SÃO PAULO' },
  { id: 113, nome: 'INSTITUIÇÃO PAULISTA ADVENTISTA DE EDUCAÇÃO E ASSISTÊNCIA SOCIAL' },
  { id: 168, nome: 'PET CARE' },
  { id: 105, nome: 'UPA\'S SÃO PAULO' }
];

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