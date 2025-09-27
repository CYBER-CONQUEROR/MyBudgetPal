import buildForecastDataset from "../budget/forecast/forecastService.buildDataset.js";
export default function Home() {
  
  async function datasetcreate() {
  const data = await buildForecastDataset({ monthsBack: 6 });
  console.log(data);
}

datasetcreate();
  return <h1>Welcome to the Home Page</h1>;
}


