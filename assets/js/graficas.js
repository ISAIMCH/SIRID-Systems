document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.querySelector('#attendance-chart');
  if (!canvas || !window.Chart) return;
  new Chart(canvas, { type: 'line', data: { labels: ['6h', '8h', '10h', '12h', '14h', '16h', '18h', '20h'], datasets: [{ label: 'Usuarios', data: [42, 118, 86, 64, 92, 156, 204, 131], borderColor: '#1d6eff', backgroundColor: 'rgba(29,110,255,.12)', fill: true, tension: .35 }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
});
