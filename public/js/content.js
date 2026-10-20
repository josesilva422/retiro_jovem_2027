// ============================================================
//  CONTEÚDO DO SITE — edite este arquivo para atualizar o portal
//  (programação, line-up, local, novidades, fotos). Sem mexer em código.
// ============================================================
window.CONTENT = {

  // Programação (prévia). Troque pelos horários reais quando definir.
  program: [
    { day: 'Sex · 05/02', title: 'Abertura', items: [
      { time: '17h–19h', name: 'Chegada e credenciamento', desc: 'Receber pulseira, acomodação e kit.' },
      { time: '19h30', name: 'Culto de abertura', desc: 'Início oficial do RECONNECT.' },
      { time: '21h30', name: 'Acomodação e descanso', desc: '' }
    ]},
    { day: 'Sáb · 06/02', title: 'Conectados', items: [
      { time: '08h', name: 'Café da manhã', desc: '' },
      { time: '09h30', name: 'Momento devocional', desc: '' },
      { time: '10h30', name: 'Mensagem da manhã', desc: '' },
      { time: '15h', name: 'Oficinas e grupos', desc: '' },
      { time: '19h30', name: 'Noite de adoração e Palavra', desc: '' }
    ]},
    { day: 'Dom · 07/02', title: 'Propósito', items: [
      { time: '08h', name: 'Café da manhã', desc: '' },
      { time: '09h30', name: 'Devocional e mensagem', desc: '' },
      { time: '15h', name: 'Atividades e esportes', desc: '' },
      { time: '19h30', name: 'Noite de adoração e Palavra', desc: '' }
    ]},
    { day: 'Seg · 08/02', title: 'Entrega', items: [
      { time: '08h', name: 'Café da manhã', desc: '' },
      { time: '09h30', name: 'Workshops e grupos', desc: '' },
      { time: '15h', name: 'Atividades livres', desc: '' },
      { time: '19h30', name: 'Noite de entrega', desc: 'Ministração e oração.' }
    ]},
    { day: 'Ter · 09/02', title: 'Envio', items: [
      { time: '08h', name: 'Café da manhã', desc: '' },
      { time: '10h', name: 'Culto de encerramento', desc: '' },
      { time: '12h', name: 'Almoço e despedida', desc: '' },
      { time: '14h', name: 'Saída', desc: '' }
    ]}
  ],

  // Line-up: deixe vazio para mostrar "em breve". Exemplo de item:
  // { name: 'Nome', role: 'Ministrador', photo: '/img/lineup/nome.jpg' }
  lineup: [],

  // Local. Preencha quando definido. mapUrl = link do Google Maps.
  local: {
    name: 'Chácara Quinta dos Pinheiros',
    address: 'Veja a localização no mapa e trace a rota até a chácara.',
    mapUrl: 'https://share.google/ENPF1hiTpIK6WXAeM',
    // Fotos e vídeos do local (arquivos em public/img/local). type: 'video' para vídeo.
    photos: [
      { src: '/img/local/entrada.jpeg', alt: 'Entrada da Chácara Quinta dos Pinheiros' },
      { src: '/img/local/video-1.mp4', alt: 'Vídeo da chácara', type: 'video' },
      { src: '/img/local/area-verde.jpeg', alt: 'Área verde da chácara' },
      { src: '/img/local/video-2.mp4', alt: 'Vídeo da chácara', type: 'video' }
    ]
  },

  // Novidades (a mais recente primeiro)
  news: [
    { date: '2026-10-19', tag: 'Inscrições', title: 'Inscrições abertas!', text: 'Já dá para fazer o pré-cadastro aqui no site. A inscrição é confirmada após o pagamento, combinado com a liderança do seu distrito.' },
    { date: '2026-10-15', tag: 'Anúncio', title: 'O RECONNECT vem aí!', text: 'Está marcado: de 05 a 09 de fevereiro de 2027 vamos viver o retiro de jovens RECONNECT. O retiro começa na sexta, 05/02, às 19h30. Reserve a data.' },
    { date: '2026-10-15', tag: 'Line-up', title: 'Line-up em breve', text: 'Ministradores e bandas serão revelados nas próximas semanas.' }
  ],

  // Link do álbum com todas as fotos (Drive, Google Fotos etc.). Deixe vazio até ter o link.
  photosLink: '',

  // 6 fotos de destaque do retiro (preencher depois do evento).
  // Ex.: { src: '/img/retiro/foto1.jpg', alt: 'Louvor' }
  photos: []
};
