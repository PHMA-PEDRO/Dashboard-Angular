const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const API_KEY = "da04510d-5822-4404-aebd-7adc197d3f42";
const EMPRESAS = [157, 245, 241, 153, 232, 88, 128, 252, 223, 177, 247, 175, 14, 220, 186, 197, 196, 188, 198, 200, 199, 244, 132, 133, 25, 217, 60, 20, 143, 249, 49, 17, 12, 256, 236, 181, 209, 172, 259, 179, 127, 38, 215, 95, 18, 70, 69, 10, 160, 161, 242, 167, 100, 8, 139, 158, 183, 159, 11, 115, 254, 180, 113, 168, 105, 239, 62, 251, 238, 91, 237, 258, 243, 255, 240];

let currentIndex = 0;
const BATCH_SIZE = 3;

// Inicializa o Socket.io vinculado ao servidor do Fastify
const io = require('socket.io')(fastify.server, {
    cors: {
        origin: ["https://dashboard-angular-nine.vercel.app", "http://localhost:5173"],
        methods: ["GET", "POST"]
    }
});

// Helper para chamadas Axios (Evita repetição de código)
const neoveroGet = async (url) => {
    return axios.get(url, {
        headers: { 'X-API-KEY': API_KEY },
        timeout: 10000
    });
};

// Worker de Segundo Plano (Atualiza Dashboard via Socket)
async function fetchNeoveroOS(id) {
    try {
        const url = `https://tecsaude.api.neovero.com/api/queries/execute/consulta_os?data_abertura_inicio=2024-01-01T00:00&situacao_int=1,2,3,4&empresa_id=${id}`;
        const response = await neoveroGet(url);
        return { id, data: response.data, timestamp: Date.now() };
    } catch (error) {
        return { id, error: true, msg: error.message, timestamp: Date.now() };
    }
}

async function startWorker() {
    const batch = EMPRESAS.slice(currentIndex, currentIndex + BATCH_SIZE);
    const results = await Promise.all(batch.map(id => fetchNeoveroOS(id)));
    
    io.emit('data_update', results);

    currentIndex += BATCH_SIZE;
    if (currentIndex >= EMPRESAS.length) currentIndex = 0;

    setTimeout(startWorker, 4000); // 4 segundos entre lotes
}

// Registro de Rotas HTTP (Para chamadas diretas do Frontend)
const registerRoutes = () => {
    fastify.get('/indicadores', async (request, reply) => {
        const { empresa_id, data_consolidacao_inicio, data_consolidacao_fim } = request.query;
        try {
            let url = `https://tecsaude.api.neovero.com/api/queries/execute/indicador?data_consolidacao_inicio=${data_consolidacao_inicio || '2024-01-01T00:00'}&empresa_id=${empresa_id || 132}`;
            if (data_consolidacao_fim) url += `&data_consolidacao_fim=${data_consolidacao_fim}`;
            const response = await neoveroGet(url);
            return response.data;
        } catch (error) {
            reply.code(500).send({ error: error.message });
        }
    });

    fastify.get('/equipamento', async (request, reply) => {
        const { empresa_id } = request.query;
        try {
            const url = `https://tecsaude.api.neovero.com/api/queries/execute/consulta_equipamento?empresa_id=${empresa_id || 132}`;
            const response = await neoveroGet(url);
            return response.data;
        } catch (error) {
            reply.code(500).send({ error: error.message });
        }
    });
    
    // Rota de teste
    fastify.get('/', async () => ({ status: 'Sistema TecSaúde Online' }));
};

// Inicialização do Servidor
async function start() {
    // 1. CORS deve vir ANTES das rotas
    await fastify.register(require('@fastify/cors'), {
        origin: ["https://dashboard-angular-nine.vercel.app", "http://localhost:5173"],
        methods: ["GET", "POST"]
    });

    registerRoutes();

    try {
        const port = process.env.PORT || 3001;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        startWorker();
        console.log(`🚀 Servidor rodando na porta ${port}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

start();