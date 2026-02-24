import React, { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  ComposedChart,
} from 'recharts';



const BASE_URL = import.meta.env.MODE === 'production'
  ? 'https://tecsaude-api.onrender.com'
  : 'http://127.0.0.1:3001';

const ANOS = [2024, 2025, 2026];
const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Funções utilitárias mantidas intactas
function normalizeMes(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/(\d{4})[-/](\d{1,2})/) || s.match(/(\d{1,2})[-/](\d{4})/);
  if (m) {
    if (m[1].length === 4) return `${m[1]}-${m[2].padStart(2, '0')}`;
    return `${m[2]}-${m[1].padStart(2, '0')}`;
  }
  return s;
}

function getVal(row, key) {
  if (row == null) return 0;
  const v = row[key];
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function getCol(row, ...candidates) {
  if (row == null) return undefined;
  const norm = (s) => String(s || '').trim().toUpperCase().replace(/\./g, '');
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== null && v !== '') return v;
    const key = Object.keys(row).find((k) => norm(k) === norm(c));
    if (key != null) return row[key];
  }
  return undefined;
}

function getChartType(indicador) {
  const s = String(indicador || '').toUpperCase();
  if (s.includes('10') || s.includes('2')) return 'proporcao';  
  if (s.includes('7') || s.includes('8') || s.includes('4') || s.includes('6')) return 'resposta'; 
  if (s.includes('1.1') || s.includes('5') || s.includes('3')) return 'velocidade';   
  return 'velocidade';
}

function isResponseType(indicador) {
  return getChartType(indicador) === 'resposta';
}

const BATCH_SIZE = 100;


function App() {
  const [indicadorFiltro, setIndicadorFiltro] = useState('');
  const [ano, setAno] = useState(2026);
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [listaEmpresas, setListaEmpresas] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [empresaClicadaRanking, setEmpresaClicadaRanking] = useState(null);
  const [projetosConsolidados, setProjetosConsolidados] = useState([]);
  const [projetosNaoConsolidados, setProjetosNaoConsolidados] = useState([]);
  const [projetoSelecionado, setProjetoSelecionado] = useState('');

  // 1. Efeito para buscar as empresas permitidas na inicialização
  useEffect(() => {
    fetch(`${BASE_URL}/empresas`)
      .then(res => res.json())
      .then(result => {
        if (result && result.empresas) {
          setListaEmpresas(result.empresas);
        }
      })
      .catch(err => {
        console.error('Erro ao carregar lista de empresas:', err);
        setError('Falha ao conectar com o servidor para buscar as empresas.');
        setLoading(false);
      });
  }, []);

  // 2. Efeito principal para buscar os indicadores
  useEffect(() => {
    if (listaEmpresas.length === 0 && !error) return;

    setLoading(true);
    setError(null);
    const inicio = `${ano}-01-01T00:00`;
    const fim = `${ano}-12-31T23:59:59`;

    const ids = empresaFiltro
      ? [empresaFiltro]
      : listaEmpresas.map(e => e.id);

    const fetchOne = (id) => {
      const url = `${BASE_URL}/indicadores?data_consolidacao_inicio=${inicio}&data_consolidacao_fim=${fim}&empresa_id=${id}`;
      const isLocal = import.meta.env.MODE !== 'production';
      const fetchOptions = isLocal
        ? { headers: { 'x-api-key': 'da04510d-5822-4404-aebd-7adc197d3f42' } }
        : {};
      return fetch(url, fetchOptions)
        .then((r) => r.json())
        .then((res) => {
          const list = Array.isArray(res) ? res : res?.data ?? [];
          return list.map((row) => ({ ...row, _empresa_id: id }));
        })
        .catch(() => []); // Falhas individuais não quebram o fluxo
    };

    const runBatches = async () => {
      const all = [];
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(fetchOne));
        results.forEach((arr) => all.push(...arr));
      }
      setData(all);
      setLoading(false);
    };

    runBatches().catch((err) => {
      setError(err.message);
      setData([]);
      setLoading(false);
    });
  }, [ano, empresaFiltro, listaEmpresas]);

  // 3. Efeito para calcular projetos consolidados e não consolidados
  // Empresas sem dados no mês selecionado
  useEffect(() => {
    // Seleciona o mês atual (primeiro mês do ano, ex: janeiro)
    const mesSelecionado = `${ano}-01`;
    // Empresas presentes nos dados do mês
    const empresasComDados = new Set();
    data.forEach((row) => {
      const mes = normalizeMes(getCol(row, 'MÊS', 'MES'));
      if (mes && mes.startsWith(mesSelecionado)) {
        const empresaId = getCol(row, 'EMPRESA') ?? row._empresa_id;
        if (empresaId) empresasComDados.add(String(empresaId));
      }
    });
    // Empresas sem dados
    const empresasSemDados = listaEmpresas
      .filter(e => !empresasComDados.has(String(e.id)))
      .map(e => e.nome);
    setProjetosNaoConsolidados(empresasSemDados);
    setProjetosConsolidados([]); // Não usado, mas mantido para compatibilidade
  }, [data, ano, listaEmpresas]);

  // Totais para o gráfico
  const totalConsolidado = projetosConsolidados.length;
  const totalNaoConsolidado = projetosNaoConsolidados.length;

  const dataDoAno = useMemo(() => {
    const prefix = String(ano);
    return data.filter((r) => {
      const m = normalizeMes(getCol(r, 'MÊS', 'MES'));
      return m && m.startsWith(prefix);
    });
  }, [data, ano]);

  const empresasNoAno = useMemo(() => {
    const set = new Set();
    dataDoAno.forEach((r) => {
      const e = getCol(r, 'EMPRESA') ?? r._empresa_id ?? '';
      if (e !== '') set.add(String(e));
    });
    return [...set].sort((a, b) => String(a).localeCompare(String(b)));
  }, [dataDoAno]);

  const { byCompanyYear, byMonthYear, byCompanyMonth, cards } = useMemo(() => {
    const byCompanyYear = {};
    const byMonthYear = {};
    const byCompanyMonth = {};

    dataDoAno.forEach((r) => {
      const emp = String(getCol(r, 'EMPRESA') ?? r._empresa_id ?? '');
      const mes = normalizeMes(getCol(r, 'MÊS', 'MES'));
      const coefc = getVal(r, 'COEFC.') || getVal(r, 'COEFC');
      const meta = getVal(r, 'META');
      if (!mes || !mes.startsWith(String(ano))) return;

      if (!byCompanyYear[emp]) byCompanyYear[emp] = { sumCoefc: 0, sumMeta: 0, n: 0 };
      byCompanyYear[emp].sumCoefc += coefc;
      byCompanyYear[emp].sumMeta += meta;
      byCompanyYear[emp].n += 1;

      if (!byMonthYear[mes]) byMonthYear[mes] = { sumCoefc: 0, sumMeta: 0, n: 0 };
      byMonthYear[mes].sumCoefc += coefc;
      byMonthYear[mes].sumMeta += meta;
      byMonthYear[mes].n += 1;

      if (!byCompanyMonth[emp]) byCompanyMonth[emp] = {};
      if (!byCompanyMonth[emp][mes])
        byCompanyMonth[emp][mes] = { sumCoefc: 0, sumMeta: 0, n: 0 };
      byCompanyMonth[emp][mes].sumCoefc += coefc;
      byCompanyMonth[emp][mes].sumMeta += meta;
      byCompanyMonth[emp][mes].n += 1;
    });

    let totalCoefc = 0,
      totalMeta = 0,
      totalN = 0;
    Object.values(byCompanyYear).forEach((v) => {
      totalCoefc += v.sumCoefc;
      totalMeta += v.sumMeta;
      totalN += v.n;
    });

    const mediaCoefc = totalN > 0 ? totalCoefc / totalN : 0;
    const mediaMeta = totalN > 0 ? totalMeta / totalN : 0;
    const pctGlobal = mediaMeta > 0 ? (mediaCoefc / mediaMeta) * 100 : 0;
    const acimaMeta = Object.values(byCompanyYear).filter((v) => {
      const pct = v.sumMeta > 0 ? (v.sumCoefc / v.sumMeta) * 100 : 0;
      return pct >= 100;
    }).length;

    const cards = {
      mediaCoefc,
      mediaMeta,
      pctGlobal,
      acimaMeta,
      totalEmpresas: Object.keys(byCompanyYear).length,
    };

    return { byCompanyYear, byMonthYear, byCompanyMonth, cards };
  }, [dataDoAno, ano]);

  const rankingData = useMemo(() => {
    return empresasNoAno.map((emp) => {
      const v = byCompanyYear[emp] || { sumCoefc: 0, sumMeta: 0 };
      const pct = v.sumMeta > 0 ? (v.sumCoefc / v.sumMeta) * 100 : 0;
      return { empresa: emp, pct, acima: pct >= 100 };
    }).sort((a, b) => b.pct - a.pct);
  }, [empresasNoAno, byCompanyYear]);

  const trendData = useMemo(() => {
    const mesesOrd = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    return mesesOrd.map((mes) => {
      const vm = byMonthYear[mes] || { sumCoefc: 0, sumMeta: 0, n: 0 };
      const mediaEmpresas = vm.n > 0 ? vm.sumCoefc / vm.n : 0;
      const metaMedia = vm.n > 0 ? vm.sumMeta / vm.n : 0;
      let valorSelecionado = null;
      if (empresaClicadaRanking) {
        const cm = byCompanyMonth[empresaClicadaRanking]?.[mes];
        valorSelecionado = cm && cm.n > 0 ? cm.sumCoefc / cm.n : null;
      }
      const [, m] = mes.split('-');
      return {
        mes: MESES_LABEL[parseInt(m, 10) - 1],
        meta: metaMedia,
        mediaEmpresas,
        empresaSelecionada: valorSelecionado,
      };
    });
  }, [ano, byMonthYear, byCompanyMonth, empresaClicadaRanking]);

  const heatmapMeses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`),
    [ano]
  );

  const indicadoresUnicos = useMemo(() => {
    const set = new Set();
    dataDoAno.forEach((r) => {
      const ind = getCol(r, 'INDICADOR');
      if (ind) set.add(ind);
    });
    return [...set].sort();
  }, [dataDoAno]);

  const INDICADORES_DESEJADOS = [
    'OPER 1.1 - PRODUTIVIDADE',
    'OPER 2 - % DE MC CONCLUÍDA INTERNAMENTE',
    'OPER 3 - MC CONCLUIDAS',
    'OPER 4 - % PENDÊNCIAS MC',
    'OPER 5 - %  CONCLUSÃO DE PLANEJADAS',
    'OPER 6 - % PENDÊNCIAS PLANEJADAS',
    'OPER 7 - TEMPO MÉDIO PARA REPARO',
    'OPER 8 - TEMPO MÉDIO DE ATENDIMENTO',
    'OPER 10 - % CONCLUSÃO DE RONDAS PLANEJADAS',
  ];

  const graficosPorIndicador = useMemo(() => {
    const mesesOrd = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const byIndMes = {};
    dataDoAno.forEach((r) => {
      const ind = getCol(r, 'INDICADOR');
      const mes = normalizeMes(getCol(r, 'MÊS', 'MES'));
      if (!ind || !mes || !mes.startsWith(String(ano))) return;
      const coefc = getVal(r, 'COEFC.') || getVal(r, 'COEFC');
      const meta = getVal(r, 'META');
      
      let den = getVal(r, 'DENOMINADOR');
      if (ind && (
        ind.toUpperCase().includes('OPER 2') ||
        ind.toUpperCase().includes('OPER 3') ||
        ind.toUpperCase().includes('OPER 10')
      )) {
        den = getVal(r, 'DENOMINADOR') || getVal(r, 'QTD') || getVal(r, 'QTD TOTAL') || getVal(r, 'QTD MC') || getVal(r, 'QTD RONDAS') || getVal(r, 'TOTAL');
      }
      if (!byIndMes[ind]) byIndMes[ind] = {};
      if (!byIndMes[ind][mes]) byIndMes[ind][mes] = { sumCoefc: 0, sumMeta: 0, sumDen: 0, n: 0 };
      byIndMes[ind][mes].sumCoefc += coefc;
      byIndMes[ind][mes].sumMeta += meta;
      byIndMes[ind][mes].sumDen += den;
      byIndMes[ind][mes].n += 1;
    });

    return INDICADORES_DESEJADOS.map((nome) => {
      const ind = indicadoresUnicos.find((i) => i.toUpperCase().includes(nome.split(' - ')[0].replace('OPER','').trim().toUpperCase()));
      if (!ind) return null;
      const serie = mesesOrd.map((mes) => {
        const v = byIndMes[ind]?.[mes] || { sumCoefc: 0, sumMeta: 0, sumDen: 0, n: 0 };
        const coefc = v.n > 0 ? v.sumCoefc / v.n : 0;
        const meta = v.n > 0 ? v.sumMeta / v.n : 0;
        const [, m] = mes.split('-');
        return {
          mes: MESES_LABEL[parseInt(m, 10) - 1],
          mesKey: mes,
          coefc,
          meta,
          denominador: v.sumDen,
          acimaMeta: meta > 0 && coefc >= meta,
        };
      });
      let sumCoefc = 0, sumMeta = 0, n = 0;
      serie.forEach((s) => {
        sumCoefc += s.coefc;
        sumMeta += s.meta;
        n += 1;
      });
      const mediaCoefc = n > 0 ? sumCoefc / n : 0;
      const mediaMeta = n > 0 ? sumMeta / n : 0;
      const response = isResponseType(ind);
      const bateuMetaAno = response ? (mediaMeta > 0 && mediaCoefc <= mediaMeta) : (mediaMeta > 0 && mediaCoefc >= mediaMeta);
      return { indicador: nome, serie, mediaCoefc, mediaMeta, bateuMetaAno, tipo: getChartType(ind) };
    }).filter(Boolean);
  }, [dataDoAno, ano, indicadoresUnicos]);

  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>Dashboard Indicadores</h1>
          <p className="subtitle">Carregando...</p>
        </header>
        <div className="loading">Carregando dados...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>Dashboard Indicadores</h1>
        </header>
        <div className="error">Erro: {error}</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header header-controls organic-header">
        <h1>Dashboard Indicadores</h1>
        <p className="subtitle">Ranking, tendência e matriz de desempenho por ano</p>
        <div className="organic-filters-cards">
          <div className="organic-filters">
            <label>
              <span>Ano</span>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                {ANOS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Indicador (matriz)</span>
              <select value={indicadorFiltro || ''} onChange={e => setIndicadorFiltro(e.target.value)}>
                <option value="">Todos</option>
                {indicadoresUnicos.map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Empresa (opcional)</span>
              <select
                value={empresaFiltro}
                onChange={(e) => {
                  setEmpresaFiltro(e.target.value);
                  setEmpresaClicadaRanking(null);
                }}
              >
                <option value="">Todas</option>
                {/* Exibe nome da empresa no select */}
                {listaEmpresas.map((empresa) => (
                  <option key={empresa.id} value={String(empresa.id)}>{empresa.nome}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="organic-cards-resumo">
            <div className="organic-card-resumo">
              <span className="organic-card-resumo-label">Média COEFC. (ano)</span>
              <span className="organic-card-resumo-value">{cards.mediaCoefc.toFixed(2)}</span>
            </div>
            <div className="organic-card-resumo">
              <span className="organic-card-resumo-label">Média META (ano)</span>
              <span className="organic-card-resumo-value">{cards.mediaMeta.toFixed(2)}</span>
            </div>
            <div className="organic-card-resumo">
              <span className="organic-card-resumo-label">% Atingimento global</span>
              <span className="organic-card-resumo-value">{cards.pctGlobal.toFixed(1)}%</span>
            </div>
            <div className="organic-card-resumo">
              <span className="organic-card-resumo-label">Empresas acima da meta</span>
              <span className="organic-card-resumo-value">{cards.acimaMeta} / {cards.totalEmpresas}</span>
            </div>
          </div>
        </div>
      </header>

      {dataDoAno.length === 0 ? (
        <div className="empty">Nenhum dado para o ano {ano}.</div>
      ) : (
        <>
          <section className="block">
            <h2 className="block-title">Ranking por % de atingimento da meta (média COEFC. / média META)</h2>
            <p className="block-hint">Clique em uma barra para destacar a tendência mensal dessa empresa. Verde = ≥100%, Vermelho = &lt;100%.</p>
            <ResponsiveContainer width="100%" height={Math.max(200, rankingData.length * 28)}>
              <BarChart
                layout="vertical"
                data={rankingData}
                margin={{ top: 4, right: 8, left: 40, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="2 2" stroke="#475569" />
                <XAxis type="number" domain={[0, 'auto']} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="empresa" width={56} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }} />
                <Bar
                  dataKey="pct"
                  name="% Meta"
                  radius={[0, 4, 4, 0]}
                  onClick={(payload) => setEmpresaClicadaRanking(payload?.empresa ?? null)}
                  cursor="pointer"
                >
                  {rankingData.map((entry, index) => (
                    <Cell key={index} fill={entry.acima ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
                <ReferenceLine x={100} stroke="#94a3b8" strokeDasharray="4 4" />
              </BarChart>
            </ResponsiveContainer>
            {empresaClicadaRanking && (
              <p className="block-hint">Tendência abaixo: evolução da empresa <strong>{empresaClicadaRanking}</strong>. Limpar: clique em outra barra ou mude o filtro.</p>
            )}
          </section>

          <section className="block">
            <div className="indicadores-grid">
              {graficosPorIndicador.map(({ indicador, serie, mediaMeta, mediaCoefc, bateuMetaAno, tipo }) => (
                <div key={indicador} className="chart-indicador-block">
                  <div className="chart-indicador-header">
                    <span className={`status-dot ${bateuMetaAno ? 'status-ok' : 'status-fail'}`} title={bateuMetaAno ? 'Meta batida (média do ano)' : 'Meta não batida'} />
                    <h3 className="chart-indicador-title">{indicador}</h3>
                    <span className="chart-indicador-tipo">{tipo === 'velocidade' ? 'Quanto maior, melhor' : tipo === 'resposta' ? 'Quanto menor, melhor' : 'Volume vs. % conclusão'}</span>
                  </div>
                  <div className="chart-indicador-body">
                    {tipo === 'velocidade' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={serie} margin={{ top: 4, right: 8, left: 8, bottom: 12 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#475569" />
                          <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }} />
                          <ReferenceLine y={mediaMeta} stroke="#ef4444" strokeDasharray="4 4" label="Meta" />
                          <Bar dataKey="coefc" name="COEFC." radius={[4, 4, 0, 0]}>
                            {serie.map((entry, i) => (
                              <Cell key={i} fill={(entry.meta > 0 && entry.coefc >= entry.meta) ? '#22c55e' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    {tipo === 'resposta' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={serie} margin={{ top: 4, right: 8, left: 8, bottom: 12 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#475569" />
                          <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }} />
                          <Line type="monotone" dataKey="coefc" name="COEFC. (real)" stroke="#38bdf8" strokeWidth={2} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="meta" name="Meta (limite)" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
                          <Legend />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    {tipo === 'proporcao' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart data={serie} margin={{ top: 4, right: 16, left: 8, bottom: 12 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#475569" />
                          <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} label={{ value: 'Volume (Total)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} label={{ value: '% Conclusão (COEFC.)', angle: 90, position: 'insideRight', fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }} />
                          <Bar yAxisId="left" dataKey="denominador" name="Total (Denominador)" fill="#64748b" radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="coefc" name="% Conclusão" stroke="#38bdf8" strokeWidth={2} dot={{ r: 4 }} />
                          <Legend />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>


          {/* ...card removido conforme solicitado... */}

          <section className="block">
            <h2 className="block-title">Matriz de desempenho (verde = bateu a meta no mês, vermelho = não bateu)</h2>
            <div className="heatmap-wrap">
              <table className="heatmap">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    {heatmapMeses.map((mes) => {
                      const [, m] = mes.split('-');
                      return <th key={mes}>{MESES_LABEL[parseInt(m, 10) - 1]}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {empresasNoAno.map((emp) => (
                    <tr key={emp}>
                      <td className="heatmap-empresa">{emp}</td>
                      {heatmapMeses.map((mes) => {
                        let cell = byCompanyMonth[emp]?.[mes];
                        if (indicadorFiltro) {
                          cell = null;
                          for (const r of dataDoAno) {
                            const ind = getCol(r, 'INDICADOR');
                            const empresa = getCol(r, 'EMPRESA');
                            const mesRow = normalizeMes(getCol(r, 'MÊS', 'MES'));
                            if (ind === indicadorFiltro && empresa === emp && mesRow === mes) {
                              const coefc = getVal(r, 'COEFC.') || getVal(r, 'COEFC');
                              const meta = getVal(r, 'META');
                              if (!cell) cell = { sumCoefc: 0, sumMeta: 0, n: 0 };
                              cell.sumCoefc += coefc;
                              cell.sumMeta += meta;
                              cell.n += 1;
                            }
                          }
                        }
                        const coefc = cell && cell.n > 0 ? cell.sumCoefc / cell.n : 0;
                        const meta = cell && cell.n > 0 ? cell.sumMeta / cell.n : 0;
                        const bateu = meta > 0 && coefc >= meta;
                        return (
                          <td
                            key={mes}
                            className={`heatmap-cell ${bateu ? 'heatmap-ok' : 'heatmap-fail'}`}
                            title={`${emp} ${mes}: COEFC ${coefc.toFixed(2)} / Meta ${meta.toFixed(2)}`}
                          >
                            {cell && cell.n > 0 ? coefc.toFixed(1) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default App;