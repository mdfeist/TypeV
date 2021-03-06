/**
 * Processes and draws the TypeDNA diagram.
 *
 * Authors:
 *  - Michael Fiest
 *  - Eddie Antonio Santos
 *  - Ian Watts
 */

import assert from './assert';

import Author, {AuthorConfiguration} from './author';
import Cell from './cell';
import Commit, {CommitMap} from './commit';
import DataView, {CommitStatistics} from './data-filter';
import JavaType from './java-type';
import TimeSlice from './time-slice';

import preprocessData, {PreprocessedData} from './preprocess-data';

var CELL_INFO_WIDTH = 500;

const TEMP_PROJECT = 'bookeeper';

/* Cell Info */
var cellInfo = d3.select("body")
  .append("div")
  .style("position", "absolute")
  .style("z-index", "10")
  .style("visibility", "hidden")
  .style("width", `${CELL_INFO_WIDTH}px`)
  .classed('panel panel-default', true);

cellInfo.append('div')
  .classed('panel-heading', true)
  .style("font-weight", "bold")
  .text('Info');

/* Draw table given JSON */
export function createTable(data: Project, filter: Filter) {
  /* TODO: Remove global! */
  window.DATA = data;
  /* TODO: Remove global! */
  let preprocessed = window.preprocessedData = preprocessData(data);

  // TODO: Get rid of window.
  let config = (<any>window).CONFIG =
    getAuthorConfiguration(preprocessed.projectName, data.authors);

  return createTable2(filter);
}

/**
 * Draw table given filter.
 */
export function createTable2(filter: Filter) {
  /* Plop this in dna-table div */
  var dnaTable = document.getElementById('dna-table');

  /* Clear previous table */
  dnaTable.innerHTML = "";

  // TODO: get rid of window
  var processed = window.preprocessedData as PreprocessedData;
  // TODO: get rid of window
  let config = (<any> window).CONFIG as AuthorConfiguration;
  var data = window.filteredData = DataView.filter(processed, filter, config);

  drawGraph(data, dnaTable.offsetWidth);
  saveAuthorConfiguration(processed.projectName, config);

  /* TODO: This view is not ready yet. */
  //drawStats(data, dnaTable.offsetWidth);

  return data;
}

/*=== Graph ===*/

function drawGraph(data: DataView, width: number) {
  var marginLeft = 150;
  var cellHeight = 64;
  var height = cellHeight * data.types.length;

  /* XXX: Sneak in a little info about the project. */
  let summaryText = d3.select('body').selectAll('.summary')
      .data([summary(data)])
      .text(d => d)
    .enter().append('pre')
      .classed('summary', true)
      .text(d => d)
      .style('display', 'none');

  /* Create a scale for the types i.e., the y-axis */
  var yScale = d3.scale.ordinal()
    .domain(data.types.map(type => type.fullyQualifiedName ))
    .rangeBands([0, height]);

  /* Create a scale for the dates i.e., the x-axis */
  var xScale = d3.time.scale()
    .domain([data.minDate, data.maxDate])
    .range([marginLeft, width]);

  var timeAxis = d3.svg.axis()
    .scale(xScale)
    .orient('bottom');

  //var cellWidth = cellWidthFromScale(first(first(data.types).cells), xScale);
  var maxCellHeight = yScale.rangeBand() - 2;

  var svg = d3.select('#dna-table').append('svg')
      .classed('main-figure', true)
      .attr("width", width)
      .attr("height", height);

  var row = svg.selectAll('.row')
      .data(data.types)
    .enter().append('g')
      .classed('row', true)
      .attr('transform', (type) => `translate(0, ${yScale(type.fullyQualifiedName)})`);

  /* The background. */
  row.append('rect')
      .attr('x', marginLeft)
      .attr('width', width - marginLeft)
      .attr('height', maxCellHeight)
      .style('fill', function (_, i) {
        /* Make alternating colour bands. */
        return i & 1 ? '#f4f4f4' : '#fafafa';
      });

  /* Create a closure over data.commits. Function#bind() won't work
   * since d3 wants to set up its own `this` to the callback! */
  let createCell = function (type: JavaType) {
    return createCellsForType.call(this, data.commits, type);
  }
  row.each(createCell);

  row.append('text')
      .classed('type-title', true)
      .attr('y', yScale.rangeBand() / 2)
      .attr('dy', '.22em')
      .attr('x', `${marginLeft - 10}px`)
      .attr('text-anchor', 'end')
      .text((type) => type.shortName );

  /* Add the time axis as a **new** SVG element, inserted BEFORE the main SVG
   * element.*/
  var floatingAxis = d3.select('#dna-table').insert('svg', '.main-figure')
      .classed('time-axis', true)
      .attr('width', width)
      /* Note: Height will be set with CSS. */
      .call(timeAxis);

  /* Make all text left-aligned, and bold all the years. */
  floatingAxis.selectAll("text")
      .attr("y", 6)
      .attr("x", 6)
      .style("text-anchor", "start")
      .classed('year-tick', function () {
        /* Matches if the text looks like a year. */
        var text = this.textContent;
        return text.match(/^\d{4,}$/);
      });

  ensureAxisIsAtGraphBottom(
    asSVGElement(svg.node()),
    asSVGElement(floatingAxis.node())
  );

  /* Dynamic type assertion for SVGElement. */
  function asSVGElement(value: any): SVGElement {
    if (value instanceof SVGElement) {
      return value;
    }
    throw new TypeError('value is not an SVGElement.');
  }

  function createCellsForType(commits: CommitMap, type: JavaType) {
    /* Create all the cells. */
    var cell = d3.select(this).selectAll('.cell')
      .data(type.cells)
      .enter().append('g')
        /* Only do cool things with cells that *HAVE* data! */
        .filter(function (cell: Cell) { return cell.hasData; })
        .classed('cell', true)
        .attr('transform', function (cell) {
          var yOffset = maxCellHeight * (1  - cell.numberOfObservations / type.numberOfObservationsInLargestCell);
          return 'translate(' + xScale(cell.startDate) + ', ' + yOffset + ')';
        });

    /* Make the deletion bar. */
    cell.append('rect')
      .classed('ast-deletions', true)
      .attr('width', function (cell) {
        return cellWidthFromScale(cell, xScale);
      })
      .attr('height', function (cell) {
        var proportion = cell.numberOfDeletions / cell.numberOfObservations;
        var height = cell.numberOfObservations / type.numberOfObservationsInLargestCell;
        return proportion * maxCellHeight * height;
      });

    /* Make the addition bar. */
    cell.append('rect')
      .classed('ast-additions', true)
      .attr('width', function (cell) {
        return cellWidthFromScale(cell, xScale);
      })
      .attr('transform', function (cell) {
        var proportion = cell.numberOfDeletions / cell.numberOfObservations;
        var height = cell.numberOfObservations / type.numberOfObservationsInLargestCell;
        var topHalf = proportion * maxCellHeight * height;

        return `translate(0, ${topHalf})`;
      })
      .attr('height', function (cell) {
        var proportion = cell.numberOfAdds / cell.numberOfObservations;
        var height = cell.numberOfObservations / type.numberOfObservationsInLargestCell;
        return proportion * maxCellHeight * height;
      });

    /* Mouse Click: Show Cell stats */
    cell.on("click", function(cellData) {
      var stats = d3.select("#stats-body");
      stats.selectAll('.content').remove();

      var info = stats.append('div')
        .classed('content', true);

      info.append('b')
        .text("Info:");
      info.append('p')
        .text("Additions: " + cellData.numberOfAdds);
      info.append('p')
        .text("Deletions: " + cellData.numberOfDeletions);
      /* TODO: Graphs here! */
      info.append('p')
        .text("Authors: " + cellData.authors.length);
      info.append('p')
        .text("Commits: " + cellData.commits.length);

      info.append('br');

      info.append('b')
        .text("Authors:");

      cellData.authors.forEach(function (author) {
        info.append('p')
          .text(author);
      });

      info.append('br');

      info.append('b')
        .text("Commits:");

      cellData.commits.forEach(function (commitID) {
        var commit = commits[commitID];
        info.append('p')
          .text("Commit ID: " + commit.commitID);
        var block = info.append('div')
          .style('padding-left', '5em');
        block.append('p')
          .text("Author: " + commit.author);
        block.append('p')
          .text("Date: " + commit.date);
        block.append('p')
          .text("Message: ");

        var msg_block = block.append('div')
          .style('padding-left', '5em');

        var lines = commit.message.split("\n");
        lines.forEach(function (line) {
          msg_block.append('p')
          .text(line);
        });

        info.append('br');
      });

      /* Open the panel/scroll to panel. */
      if ($('#stats').hasClass('collapse')) {
        $('#toggle-stats').click();
      }
      location.href = '#stats';
    });

    /* Mouse over: Show and update cell info */
    cell.on("mouseover", function(cell_data: Cell) {
      cellInfo.selectAll('ul').remove();
      var info = cellInfo.append('ul')
        .classed('list-group', true);

      info.append('li')
        .classed("list-group-item", true)
        .text("Type: " + cell_data.type);

      info.append('li')
        .classed("list-group-item", true)
        .text("Additions: " + cell_data.numberOfAdds);

      info.append('li')
        .classed("list-group-item", true)
        .text("Deletions: " + cell_data.numberOfDeletions);

      info.append('li')
        .classed("list-group-item", true)
        .text("Authors: " + cell_data.authors.length);

      info.append('li')
        .classed("list-group-item", true)
        .text("Commits: " + cell_data.commits.length);

      info.append('li')
        .classed("list-group-item", true)
        .text("Start Date: " + cell_data.startDate);
      info.append('li')
        .classed("list-group-item", true)
        .text("End Date: " + cell_data.endDate);

      var coords = d3.mouse(document.body);
      var currentx = coords[0];
      var currenty = coords[1];

      var x = currentx - CELL_INFO_WIDTH/2;

      if (x < 10) x = 10;
      if (x > width - CELL_INFO_WIDTH - 10) x = width - CELL_INFO_WIDTH -10;

      var y = currenty + maxCellHeight + 10;

      cellInfo.style('left', String(x) + "px");
      cellInfo.style('top', String(y) + "px");

      cellInfo.style("visibility", "visible");
    });

    /* Mouse move: Update position of cell info */
    cell.on("mousemove", function (_cell_data) {
      var coords = d3.mouse(document.body);
      var currentx = coords[0];
      var currenty = coords[1];

      var x = currentx - CELL_INFO_WIDTH/2;

      if (x < 10) x = 10;
      if (x > width - CELL_INFO_WIDTH - 10) x = width - CELL_INFO_WIDTH -10;

      var y = currenty + maxCellHeight + 10;

      cellInfo.style('left', String(x) + "px");
      cellInfo.style('top', String(y) + "px");
    });

    /* Mouse out: Hide cell info */
    cell.on("mouseout", function(_cell) {
      cellInfo.style("visibility", "hidden");
    });
  }
}

/**
 * Draws type coverage stats and things.
 */
function drawStats(data: DataView, width: number) {
  var marginLeft = 64;
  var overviewHeight = 480;
  var rowHeight = 64;
  var marginBottom = 32;

  var chartHeight = overviewHeight - marginBottom;

  /* Create a scale for the dates i.e., the x-axis */
  var xScale = d3.time.scale()
    .domain([data.minDate, data.maxDate])
    .range([marginLeft, width]);

  /* Make a scale for proportions that goes from bottom to top. */
  var yScale = d3.scale.linear()
    .domain([0, 1])
    .range([chartHeight, 0]);

  /* This one is used per author stats. */
  var yScaleSmall = d3.scale.linear()
    .domain([0, 1])
    .range([rowHeight, 0]);

  var timeAxis = d3.svg.axis()
    .scale(xScale)
    .outerTickSize(0) // Get rid of weird outer ticks.
    .orient('bottom');

  var verticalAxis = d3.svg.axis()
    .scale(yScale)
    .tickFormat(d3.format("5%"))
    .orient('left');

  /* Cumulative types over time. */
  var overviewSvg = d3.select('#types-over-time').append('svg')
      .classed('types-over-time', true)
      .attr("width", width)
      .attr("height", overviewHeight);

  var numberOfTypesTotal = data.numberOfTypes;
  var lineFunction = d3.svg.line<TimeSlice>()
    .x((timeslice: TimeSlice) => xScale(timeslice.startDate))
    .y((timeslice: TimeSlice) => yScale(timeslice.cumulativeTypeCount / numberOfTypesTotal))
    .interpolate('linear');

  /* Make the line chart. */
  overviewSvg.append('path')
    .classed('line-chart', true)
    .attr('d', lineFunction(data.timeslices));

  /* Add the axes. */
  overviewSvg.append('g')
    .classed('time-axis', true)
    .attr('transform', `translate(0, ${chartHeight})`)
    .call(timeAxis);
  overviewSvg.append('g')
    .classed('y-axis', true)
    .attr('transform', `translate(${marginLeft}, 0)`)
    .call(verticalAxis);

  /* It gets ugly here... */
  var lineFunctionSmallFiles = d3.svg.line<CommitStatistics>()
    .x(author => xScale(author.date))
    .y(author => {
      var proportion = author.file.cumulative / numberOfTypesTotal;
      return yScaleSmall(proportion);
    })
    .interpolate('linear');

  var lineFunctionSmallTypes = d3.svg.line<CommitStatistics>()
    .x(author => xScale(author.date))
    .y(author => {
      var proportion = author.type.cumulative / numberOfTypesTotal;
      return yScaleSmall(proportion);
    })
    .interpolate('linear');

  /*
   * Per author stats.
   */

  let authors = Array.from(data.authorStats.keys());

  var authorCoverage = d3.select('#coverage-by-author').selectAll('.author-coverage')
      .data(authors)
    .enter().append('svg')
      .attr('height', rowHeight + 32)
      .attr('width', width)
      .classed('author-coverage', true);

  authorCoverage.append('path')
    .classed('file-coverage', true)
    .attr('d', (author) => lineFunctionSmallFiles(data.authorStats.get(author)));

  authorCoverage.append('path')
    .classed('type-coverage', true)
    .attr('d', (author) => lineFunctionSmallTypes(data.authorStats.get(author)));

  /* Axes. */
  authorCoverage.append('g')
    .attr('transform', `translate(0, ${rowHeight})`)
    .call(timeAxis);

  authorCoverage.append('text')
    .attr('transform', `translate(${marginLeft}, 16)`)
    .text((author) => author.name);

  /* TODO: Make independent axis for each author... */
  /*

  var verticalAxisSmall = d3.svg.axis()
    .scale(yScaleSmall)
    .tickFormat(d3.format("5%"))
    .orient('left');

  authorCoverage.append('g')
    .attr('transform', `translate(${marginLeft}, 0)`)
    .call(verticalAxisSmall);
  */
}

/**
 * Returns the download link for a CSV file (with header)
 * for per-author type and file coverage statistics.
 */
export function makeCSVLink(data: DataView) {
  var lines: string[] = [];
  var filesTotal = data.numberOfFiles;
  var typesTotal = data.numberOfTypes;

  /* Add the header. */
  addRow('Metric', 'Author', 'Date', 'Coverage');
  type Metric = 'file' | 'type';

  for (var author of data.authorStats.keys()) {
    for (var stats of data.authorStats.get(author)) {
      addRow(
        'file',
        author.id,
        +stats.date, // Coerce to Unix timestamp in ms
        stats.file.cumulative / filesTotal
      );
      addRow(
        'type',
        author.id,
        +stats.date, // Coerce to Unix timestamp in ms
        stats.type.cumulative / typesTotal
      );
    }
  }

  function addRow(...headers: Array<string>): void;
  function addRow(name: Metric, author: string, date: number, total: number): void;

  function addRow() {
    for (let i = 0; i < arguments.length; i++) {
      if (/[,"]/.exec(arguments[i]))
        throw new Error('Invalid char in:' + arguments[i]);
    }
    lines.push(Array.prototype.join.call(arguments, ','));
    lines.push('\n');
  }

  var blob = new Blob(lines, {type: 'text/csv'});

  return URL.createObjectURL(blob);
};

/**
 * Places the axis on the bottom of the graph on initial render, when the
 * screen is too big.
 */
function ensureAxisIsAtGraphBottom(graph: SVGElement, axis: SVGElement) {
  var paddingBottom = 60;
  var bottomOfGraph = graph.getBoundingClientRect().bottom;

  /* When the screen can accomodate the graph and its padding at the bottom,
   * do not reposition. */
  var shouldReposition = bottomOfGraph + paddingBottom < viewportHeight();

  if (shouldReposition) {
    /* Set to the height. */
    //axis.style.top = graph.getBoundingClientRect().height;;
    axis.classList.add('axis-on-bottom');
  } else {
    axis.classList.add('axis-floating');
  }
}

/**
 * Returns LaTeX code for a table row summarizing the current project.
 */
function summary({numberOfCommits, primaryAuthorAliases, numberOfFiles, numberOfTypes, astDiffs}: DataView) {
  return `project & ${numberOfCommits} & ${primaryAuthorAliases} & ${numberOfFiles} & ${numberOfTypes} & ${astDiffs.length}`;
}

/**
 * http://stackoverflow.com/a/8876069
 */
function viewportHeight() {
  return Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
}

/*=== Utilties ===*/

function cellWidthFromScale(cell: Cell, scale: (_: Date) => number) {
  var bigger = scale(cell.endDate);
  var smaller = scale(cell.startDate);
  assert(bigger > smaller);
  /* Ensure it rounds up to remove horizontal gaps. */
  return Math.ceil(bigger - smaller) + 1;
}

/**
 * Attempts to fetch configuration from LocalStorage, falling back on the
 * provided list of author names.
 */
function getAuthorConfiguration(projectName: string, fallback: string[]): AuthorConfiguration {
  const key = `${projectName}:authors`;

  let configAsJSON = window.localStorage.getItem(key);

  if (configAsJSON) {
    let configObject = JSON.parse(configAsJSON);
    /* TODO: Assert that all authors are accounted for.  */
    return new AuthorConfiguration(configObject);
  } else {
    return AuthorConfiguration.generateDefaultConfiguration(fallback);
  }
}

function saveAuthorConfiguration(projectName: string, config: AuthorConfiguration) {
  const key = `${projectName}:authors`;
  const serializedConfig = JSON.stringify(config.toPlainObject());
  window.localStorage.setItem(key, serializedConfig);
}
