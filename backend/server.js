const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const API_KEY = "da04510d-5822-4404-aebd-7adc197d3f42";
const EMPRESAS = [157, 245, 241, 153, 232, 88, 128, 252, 223, 177, 247, 175, 14, 220, 186, 197, 196, 188, 198, 200, 199, 244, 132, 133, 25, 217, 60, 20, 143, 249, 49, 17, 12, 256, 236, 181, 209, 172, 259, 179, 127, 38, 215, 95, 18, 70, 69, 10, 160, 161, 242, 167, 100, 8, 139, 158, 183, 159, 11, 115, 254, 180, 113, 168, 105, 239, 62, 251, 238, 91, 237, 258, 243, 255, 240];

let io;
let currentIndex = 0;
const BATCH_SIZE = 3; // Reduzi para 3 para ser ainda mais seguro com o limite da API

async function fetchNeovero(id) {
    try {
        const url = `https://tecsaude.api.neovero.com/api/queries/execute/consulta_os?data_abertura_inicio=2024-01-01T00:00&situacao_int=1,2,3,4&empresa_id=${id}`;
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 8000
        });
        return { id, data: response.data, timestamp: Date.now() };
    } catch (error) {
        console.error(`Erro na Unidade ${id}:`, error.response?.status || error.message);
        return { id, error: true, msg: error.message, timestamp: Date.now() };
    }
}

// ENDPOINTS ADICIONAIS (registrados após CORS no start())
function registerRoutes() {
fastify.get('/padroes', async (request, reply) => {
    try {
        const url = 'https://tecsaude.api.neovero.com/api/queries/execute/consulta_padroes';
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 8000
        });
        reply.send(response.data);
    } catch (error) {
        reply.code(500).send({ error: error.message });
    }
});

fastify.get('/indicadores', async (request, reply) => {
    const { empresa_id = 132, data_consolidacao_inicio = '2020-01-01T00:00', data_consolidacao_fim } = request.query;
    try {
        let url = `https://tecsaude.api.neovero.com/api/queries/execute/indicador?data_consolidacao_inicio=${data_consolidacao_inicio}&empresa_id=${empresa_id}`;
        if (data_consolidacao_fim) url += `&data_consolidacao_fim=${data_consolidacao_fim}`;
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 8000
        });
        reply.send(response.data);
    } catch (error) {
        reply.code(500).send({ error: error.message });
    }
});

fastify.get('/os', async (request, reply) => {
    const { empresa_id = 132, data_abertura_inicio = '2022-01-01T00:00', situacao_int = '1,2,3,4' } = request.query;
    try {
        const url = `https://tecsaude.api.neovero.com/api/queries/execute/consulta_os?data_abertura_inicio=${data_abertura_inicio}&situacao_int=${situacao_int}&empresa_id=${empresa_id}`;
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 8000
        });
        reply.send(response.data);
    } catch (error) {
        reply.code(500).send({ error: error.message });
    }
});

fastify.get('/equipamento', async (request, reply) => {
    const { empresa_id = 132, setor_id, familia_id } = request.query;
    try {
        let url = `https://tecsaude.api.neovero.com/api/queries/execute/consulta_equipamento?empresa_id=${empresa_id}`;
        if (setor_id) url += `&setor_id=${setor_id}`;
        if (familia_id) url += `&familia_id=${familia_id}`;
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 8000
        });
        reply.send(response.data);
    } catch (error) {
        reply.code(500).send({ error: error.message });
    }
});

fastify.get('/equipamento_tecsaude', async (request, reply) => {
    const { empresa_id = 132 } = request.query;
    try {
        const url = `https://tecsaude.api.neovero.com/api/queries/execute/consulta_equipamento_tecsaude?empresa_id=${empresa_id}`;
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 8000
        });
        reply.send(response.data);
    } catch (error) {
        reply.code(500).send({ error: error.message });
    }
});
}

async function worker() {
    const batch = EMPRESAS.slice(currentIndex, currentIndex + BATCH_SIZE);
    const results = await Promise.all(batch.map(id => fetchNeovero(id)));
    
    io.emit('data_update', results);

    currentIndex += BATCH_SIZE;
    if (currentIndex >= EMPRESAS.length) currentIndex = 0;

    // Aguarda 3 segundos para a próxima leva (ciclo total de ~75 segundos para cobrir tudo)
    setTimeout(worker, 3000);
}

async function start() {
    await fastify.register(require('@fastify/cors'), { origin: true });
    registerRoutes();
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    io = require('socket.io')(fastify.server, { cors: { origin: '*' } });
    worker();
    console.log("🚀 Servidor Autenticado e Rodando na porta 3001");
}

start().catch((err) => {
    console.error(err);
    process.exit(1);
});