import {CONFIG} from '../config';
import {knex} from '../common';

export const rowsToDateFigures = (rows, retainTime, date, isMonth) => {
  let map = {};
  rows.forEach((ds) => {
    map[ds.date] = ds.figure;
  });
  let d;
  if (date) {
    d = new Date(date);
  } else {
    d = new Date();
  }
  let retainDates = {};
  for (let i = 0; i < retainTime; i++) {
    let str;
    let localISOTime = new Date(d.getTime() + CONFIG.timezone.tzoffset).toISOString().slice(0, -1);
    if (isMonth) {
      let tmp = localISOTime.split('T')[0].split('-');
      str = `${tmp[0]}-${tmp[1]}`;
    } else {
      [str] = localISOTime.split('T');
    }
    if (!map[str]) {
      map[str] = 0;
    }
    retainDates[str] = true;
    if (isMonth) {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - 1);
    }
  }
  let dateFigures = [];
  Object.keys(map).forEach((key) => {
    if (retainDates[key]) {
      dateFigures.push([key, map[key]]);
    }
  });
  dateFigures.sort((a, b) => a[0].localeCompare(b[0]));
  let dates = [];
  let figures = [];
  dateFigures.forEach((ds) => {
    dates.push(ds[0]);
    figures.push(parseInt(ds[1], 10));
  });
  return [dates, figures];
};

export const handleCumulativeDateFigures = (rows) => {
  let prev = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] > 0) {
      prev = rows[i];
    } else {
      rows[i] = prev;
    }
  }
};

