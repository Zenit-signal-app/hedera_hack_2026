const tooltipDefaults = {
    enabled:true,
    position : 'absolute',
    padding : '5px',
    backgroundColor : 'rgb(19,23,35)',
    color : '#fff',
    borderRadius : '4px',
    display : 'none',
    transform : 'translate(-50%, -100%)',
    zIndex : 9999999,
    textAlign : 'center',

}
const backgroundDefaults = {
    zIndex : -3,
    position : 'absolute',
    inset : '0px',
    opacity : '1',
    backgroundSize : 'cover',
    backgroundColor : '#131723'
}
const volumeProfileDefaults={
    enabled : true,
    volumeProfileId:'overlayCanvasVP',
    bins:40,
    width_percentage_vp:10,
    textColor:'white',
    color:'rgba(231,156,250,0.1)',
}
const pluginDefaults = {
    chartContainerId: 'chartContainer',
    chartDivId: 'chart',
    overlayCanvasId: 'overlayCanvas',
    series:null,
    chart:null
}
function clone(obj) {
    if (null == obj || "object" != typeof obj) return {};
    let copy = obj.constructor ? obj.constructor() : {};
    for (let attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}
class LighweightChartPlugin{
    constructor(userSettings = {}) {
        this.options = Object.assign({}, clone(pluginDefaults), clone(userSettings));
        this.options.background = Object.assign({}, clone(backgroundDefaults), clone(userSettings.background));
        this.options.tooltip = Object.assign({}, clone(tooltipDefaults), clone(userSettings.tooltip));
        this.options.volumeProfile = Object.assign({}, clone(volumeProfileDefaults), clone(userSettings.volumeprofile));
        this.series = this.options.series
        this.chart = this.options.chart
        this.scheduleRedraw = this.scheduleRedraw.bind(this);
        this.onMouseWheelEnd = this.onMouseWheelEnd.bind(this);
        this.bindEvents();
        this.chart.timeScale().subscribeVisibleTimeRangeChange(this.onMouseWheelEnd);
        this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onMouseWheelEnd);
        this.chart.timeScale().subscribeSizeChange(this.onMouseWheelEnd);
        this.redrawScheduled = false;
        this.timeoutTooltip = null;
        this.timeoutId = null;
        this.rectangles = [];
        this.circles = [];
        this.sessions = [];
        this.volume_data = [];
        this.counter = 0;
    }
    initElement() {
        try {
            this.chartContainer = document.getElementById(this.options.chartContainerId);
            this.overlayCanvasVP = document.getElementById(this.options.volumeProfile.volumeProfileId);
            this.chartDiv = document.getElementById(this.options.chartDivId);
            this.overlayCanvas = document.getElementById(this.options.overlayCanvasId);
            this.chartWidth = this.chartContainer.clientWidth;
            this.chartHeight = this.chartContainer.clientHeight;
            this.overlayCanvas.width = this.chartWidth;
            this.overlayCanvas.height = this.chartHeight;
            this.overlayCanvasVP.width = this.chartWidth;
            this.overlayCanvasVP.height = this.chartHeight;

        }catch (e) {
            console.error("Initialize Element Error : ",e);
        }
    }
    initTooltip(){
        try {
            if (this.options.tooltip.enabled === true){
                this.tooltip = document.createElement('div');
                this.tooltip.style.display = 'none';
                for (const property in this.options.tooltip) {
                    if (this.options.tooltip.hasOwnProperty(property)) {
                        this.tooltip.style[property] = this.options.tooltip[property];
                    }
                }
                document.body.appendChild(this.tooltip);
            }
        }catch (e) {
            console.error("Initialize Tooltip Error : ",e);
        }
    }
    boundRectOverlay() {
        const chartElement = this.chartDiv.querySelector('.tv-lightweight-charts canvas');
        const chartRect = chartElement.getBoundingClientRect();
        this.overlayCanvas.style.width = chartRect.width + 'px';
        this.overlayCanvas.style.height = chartRect.height + 'px';
        this.overlayCanvas.width = chartRect.width;
        this.overlayCanvas.height = chartRect.height;
        this.overlayCanvas.style.zIndex = '-1';
        this.overlayCanvasVP.style.width = chartRect.width + 'px';
        this.overlayCanvasVP.style.height = chartRect.height + 'px';
        this.overlayCanvasVP.width = chartRect.width;
        this.overlayCanvasVP.height = chartRect.height;
        this.overlayCanvasVP.style.zIndex = '-2';


    }
    bindEvents(){
        document.addEventListener('DOMContentLoaded', () => {
            this.initElement();
            this.initTooltip();
            this.boundRectOverlay();
            this.background = document.createElement('div');
            for (const property in this.options.background) {
                if (this.options.background.hasOwnProperty(property)) {
                    this.background.style[property] = this.options.background[property];
                }
            }
            this.chartContainer.appendChild(this.background);
            new ResizeObserver(entries => {
                for (let entry of entries) {
                    const { width, height } = entry.contentRect;
                    this.chart.applyOptions({ width, height });
                    this.overlayCanvas.width = width;
                    this.overlayCanvas.height = height;
                    this.overlayCanvasVP.width = width;
                    this.overlayCanvasVP.height = height;
                    try {
                        this.boundRectOverlay();
                    }catch (e) {

                    }
                }
            }).observe(this.chartContainer);
            this.chartContainer.addEventListener('mousedown', () => {
                this.isResizing = true;
            });
            this.chartContainer.addEventListener('mousemove', (event) => {
                if (this.isResizing) {
                    this.boundRectOverlay();
                    // this.onMouseWheelEnd();
                } else {
                    this.mouseX1 = event.clientX;
                    this.mouseY1 = event.clientY;
                    this.onHoverEnd();
                }
            });
            this.chartContainer.addEventListener('mouseup', () => {
                this.isResizing = false;
            });
            this.chartContainer.addEventListener('mouseout', () => {
                this.hideTooltip();
            });
            console.info('Initialize Done');
        });

    }
    onHoverEnd() {
        clearTimeout(this.timeoutTooltip);
        this.timeoutTooltip = null;
        this.timeoutTooltip = setTimeout(() => {
            this.hoverCheck();
        }, 500);
    }
    hoverCheck(){
        const rect = this.overlayCanvas.getBoundingClientRect();
        const mouseX = this.mouseX1 - rect.left;
        const mouseY = this.mouseY1 - rect.top;
        let tooltipTexts = [];
        this.rectangles.forEach(rectangle => {
            if (rectangle.tooltipText !== '') {
                const x1 = this.timeToCoordinate(rectangle.time1);
                const x2 = this.timeToCoordinate(rectangle.time2, rectangle.triggered);
                const y1 = this.priceToCoordinate(rectangle.price1);
                const y2 = this.priceToCoordinate(rectangle.price2);
                if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
                const xStart = Math.min(x1, x2);
                const yStart = Math.min(y1, y2);
                const width = Math.abs(x2 - x1);
                const height = Math.abs(y2 - y1);
                if (mouseX >= xStart && mouseX <= xStart + width && mouseY >= yStart && mouseY <= yStart + height) {
                    tooltipTexts.push(rectangle.tooltipText);
                }
                }
            }
        });
        let hoveredCircle = [];
        this.circles.forEach(circle => {
            if (circle.tooltipText !== '') {
                const x0 = this.timeToCoordinate(circle.time);
                const candle = this.series.data().find(c => c.time === circle.time);
                if (candle) {
                    const loc = circle.location_ === 'high' ? candle.high : circle.location_ === 'low' ? candle.low : circle.location_;
                    const y0 = this.priceToCoordinate(loc);
                    const y1 = circle.location_ === 'high' ? this.priceToCoordinate(loc + circle.price) : this.priceToCoordinate(loc - circle.price);
                    const radius = Math.abs(y1 - y0);
                    if (Math.sqrt(Math.pow(mouseX - x0, 2) + Math.pow(mouseY - y1, 2)) <= radius) {
                        tooltipTexts.push(circle.tooltipText);
                        hoveredCircle.push(circle)
                    }
                }
            }
        });
        if (tooltipTexts.length > 0){
            this.showTooltip(this.mouseX1,this.mouseY1,tooltipTexts);
            if (hoveredCircle.length > 0) {
                hoveredCircle.forEach(circle => {
                    const ctx = this.overlayCanvas.getContext('2d');
                    ctx.strokeStyle = 'rgb(255,205,1)';
                    ctx.lineWidth = 2;
                    const x0 = this.timeToCoordinate(circle.time);
                    const candle = this.series.data().find(c => c.time === circle.time);
                    const loc = circle.location_ ==='high' ? candle.high:circle.location_ === 'low' ? candle.low:circle.location_;
                    const y0 = this.priceToCoordinate(loc);
                    const y1 = circle.location_ === 'high' ? this.priceToCoordinate(loc + circle.price) : this.priceToCoordinate(loc - circle.price);
                    ctx.beginPath();
                    ctx.moveTo(x0, y1);
                    ctx.lineTo(x0, this.priceToCoordinate(loc));
                    ctx.stroke();
                    const arrowSize = 10;
                    ctx.fillStyle = 'rgb(255,205,1)';
                    ctx.beginPath();
                    if (circle.location_ === 'high') {
                        ctx.moveTo(x0 - arrowSize / 2, y0 - arrowSize);
                        ctx.lineTo(x0 + arrowSize / 2, y0 - arrowSize);
                        ctx.lineTo(x0, y0);
                    } else {
                        ctx.moveTo(x0 - arrowSize / 2, y0 + arrowSize);
                        ctx.lineTo(x0 + arrowSize / 2, y0 + arrowSize);
                        ctx.lineTo(x0, y0);
                    }
                    ctx.closePath();
                    ctx.fill();
                });
            }
        } else {
            this.hideTooltip();
            // onMouseWheelEnd();
        }
    }
    showTooltip(x, y, texts) {
        this.tooltip.innerHTML = texts.join('<br>');
        this.tooltip.style.display = 'flex';
        const tooltipWidth = this.tooltip.offsetWidth;
        this.tooltip.style.left = (x - tooltipWidth / 2) + 'px';
        this.tooltip.style.top = (y - 5) + 'px';
        this.overlayCanvas.style.zIndex = '1';
    }
    hideTooltip() {
        this.tooltip.style.display = 'none';
        this.overlayCanvas.style.zIndex = '-1';
    }
    addRectangle(time1, price1, time2, price2, color = 'rgba(0, 0, 255, 0.5)', useGradient = false, tooltipText = '', triggered = true, borderColor = 'rgba(250,205,21,0.9)', borderWidth = 1.5) {
        this.rectangles.push({
            time1: this.set_date(time1),
            price1,
            time2: this.set_date(time2),
            price2,
            color,
            useGradient,
            tooltipText,
            triggered,
            borderColor,
            borderWidth,
        });
        // this.onMouseWheelEnd();
    }
    redrawRectangles() {
        if (!this.rectangles) return;
        if (this.rectangles.length < 1) return;
        let upper_price = this.coordinateToPrice(0)
        let lower_price = this.coordinateToPrice(this.overlayCanvasVP.height)
        let timeRange_ = this.chart.timeScale().getVisibleRange();
        let filtered_rectangles = this.rectangles.filter(rec => {
            return rec.price1 >= lower_price && rec.price2 <= upper_price && rec.time1 >= timeRange_.from; //&& rec.time2 <= timeRange_.to;
        });
        if (filtered_rectangles.length < 1) return;
        const ctx = this.overlayCanvas.getContext('2d');
        const chunkSize = 50;
        let currentIndex = 0;
        const processChunk = () =>  {
            const endIndex = Math.min(currentIndex + chunkSize, filtered_rectangles.length);
            for (let i = currentIndex; i < endIndex; i++) {
                const rect = filtered_rectangles[i];
                const x1 = this.timeToCoordinate(rect.time1);
                const x2 = this.timeToCoordinate(rect.time2, rect.triggered);
                const y1 = this.priceToCoordinate(rect.price1);
                const y2 = this.priceToCoordinate(rect.price2);
                if (x1 === null || x2 === null || y1 === null || y2 === null) {
                    console.warn('Invalid coordinates, rectangle will not be drawn.');
                    continue;
                }
                const xStart = Math.min(x1, x2);
                const yStart = Math.min(y1, y2);
                const width = Math.abs(x2 - x1);
                const height = Math.abs(y2 - y1);
                rect._xStart = xStart;
                rect._yStart = yStart;
                rect._width = width;
                rect._height = height;
                if (rect.useGradient) {
                    const gradient = ctx.createLinearGradient(0, yStart, 0, yStart + height);
                    gradient.addColorStop(0, this.lightenColor(rect.color, 0.1, 0.1));
                    gradient.addColorStop(0.5, rect.color);
                    gradient.addColorStop(1, this.darkenColor(rect.color, 0.1, 0.1));
                    ctx.fillStyle = gradient;
                } else {
                    ctx.fillStyle = rect.color;
                }
                ctx.fillRect(xStart, yStart, width, height);
                if (rect.borderColor && rect.borderWidth) {
                    ctx.strokeStyle = rect.borderColor;
                    ctx.lineWidth = rect.borderWidth;
                    ctx.strokeRect(xStart, yStart, width, height);
                }
            }
            currentIndex = endIndex;
            if (currentIndex < filtered_rectangles.length) {
                requestAnimationFrame(processChunk);
            }
        }
        requestAnimationFrame(processChunk);
    }
    addCircle(time, price, color = 'rgba(0, 0, 255, 0.5)', useGradient = false, tooltipText = '', location_) {
        this.circles.push({ time:this.set_date(time), price, color, useGradient, tooltipText, location_:location_ ? location_:price });
        // this.onMouseWheelEnd();
    }
    redrawCircles() {
        if (!this.circles)return;
        if (this.circles.length < 1) return;
        let circles_filtered = this.getVisibleData(this.circles)
        if (circles_filtered.length >= 1) {
            const ctx = this.overlayCanvas.getContext('2d');
            circles_filtered.forEach(circle => {
                const x0 = this.timeToCoordinate(circle.time);
                const candle = this.series.data().find(c => c.time === circle.time);
                if (!candle) return this.logger('Candle not found');
                let loc_ =  circle.location_ ==='high' ? candle.high:circle.location_ === 'low' ? candle.low:circle.location_;
                const y0 = this.priceToCoordinate(loc_);
                const y1 = circle.location_ === 'high' ? this.priceToCoordinate(loc_ + circle.price) : this.priceToCoordinate(loc_ - circle.price);
                if (x0 === null || y0 === null || y1 === null) return this.logger('Invalid coordinates, circle will not be drawn.');
                const radius = Math.abs(y1 - y0);
                const xCenter = x0;
                circle._xCenter = xCenter;
                circle._y1 = y1;
                circle._radius = radius;
                if (circle.useGradient) {
                    const gradient = ctx.createRadialGradient(
                        xCenter - radius / 3,
                        y1 - radius / 3,
                        radius / 4,
                        xCenter,
                        y1,
                        radius
                    );
                    gradient.addColorStop(0, this.lightenColor(circle.color, 0.4, 0.5));
                    gradient.addColorStop(0.3, circle.color);
                    gradient.addColorStop(0.7, this.darkenColor(circle.color, 0.2, 0.4));
                    gradient.addColorStop(1, this.darkenColor(circle.color, 0.5, 0.3));
                    ctx.fillStyle = gradient;
                } else {
                    ctx.fillStyle = circle.color;
                }
                ctx.beginPath();
                ctx.arc(xCenter, y1, radius, 0, 2 * Math.PI);
                ctx.fill();
            });
        }

    }
    addSession(time,color,label){
        this.sessions.push({time:this.set_date(time),color,label});
        // onMouseWheelEnd();
    }
    redrawVerticalRectangle() {
        if (this.sessions.length >= 1) {
            let sess_filtered = this.getVisibleData(this.sessions)
            if (sess_filtered.length >= 1) {
                const ctx = this.overlayCanvas.getContext('2d');
                sess_filtered.forEach(sess => {
                    try {
                        const candleIndex = this.series.data().findIndex(c => c.time === sess.time);
                        const Xstart = this.timeToCoordinate(this.series.data().at(candleIndex).time);
                        const Xend = this.timeToCoordinate(this.series.data().at(candleIndex + 1).time);
                        const distance = (Xend - Xstart) / 2
                        if (Xstart !== null && Xend !== null) {
                            ctx.fillStyle = sess.color;
                            ctx.fillRect(Xstart - distance, 0, distance * 2, this.overlayCanvas.height);
                        } else {
                            console.warn('Unable to calculate x-coordinate for the provided date.');
                        }
                    }catch (e) {
                        console.info('Vertical Rectangle Error : ',e)
                    }
                });
            }
        }
    }
    addVolume(time,price,volume){
        this.volume_data.push({time:this.set_date(time),price,volume})
    }
    lowerBound(arr, target) {
        let left = 0;
        let right = arr.length;
        while (left < right) {
            let mid = Math.floor((left + right) / 2);
            if (arr[mid].time < target) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        return left;
    }
    upperBound(arr, target) {
        let left = 0;
        let right = arr.length;
        while (left < right) {
            let mid = Math.floor((left + right) / 2);
            if (arr[mid].time <= target) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        return left;
    }
    volumeProfile(bins) {
        if (!this.volume_data) {
            this.releaseRedraw();
            return;
        }
        if (this.options.volumeProfile.enabled === false || this.volume_data.length < 1) {
            this.releaseRedraw();
          this.clearCanvas(this.overlayCanvasVP);
          return;
        }
        const timeRange = this.chart.timeScale().getVisibleRange();
        if (timeRange === null) {
            this.releaseRedraw();
            this.logger('No visible candlesticks.');
            return ;
        }
        let visibleCandles = this.series.data().filter(candle => {
            return candle.time >= timeRange.from && candle.time <= timeRange.to;
        });
        if (visibleCandles.length === 0) {
            this.releaseRedraw();
          this.logger('No visible candlesticks in the current range.');
            return;
        }
        let highestHigh = visibleCandles[0].high;
        let lowestLow = visibleCandles[0].low;
        visibleCandles.forEach(candle => {
            if (candle.high > highestHigh) {
                highestHigh = candle.high;
            }
            if (candle.low < lowestLow) {
                lowestLow = candle.low;
            }
        });
        lowestLow = Math.max(this.coordinateToPrice(this.overlayCanvas.height), lowestLow);
        highestHigh = Math.min(this.coordinateToPrice(0), highestHigh);
        const ctx1 = this.overlayCanvasVP.getContext('2d');
        ctx1.clearRect(0, 0, this.overlayCanvasVP.width, this.overlayCanvasVP.height);
        let stepSize = (highestHigh - lowestLow) / bins;
        let ranges = [];
        let vols = new Array(bins).fill(0);
        let maxVol = 0;
        for (let i = 0; i <= bins; i++) {
            let p__ = lowestLow + (stepSize * i);
            ranges.push(this.priceToCoordinate(p__));
        }
        const startIndex = this.lowerBound(this.volume_data, timeRange.from);
        const endIndex = this.upperBound(this.volume_data, timeRange.to);
        const processVolumeDataChunk = (start, end)=> {
            const chunkSize = 500;
            for (let i = start; i < end; i++) {
                const vd = this.volume_data[i];
                if (vd.price < lowestLow || vd.price > highestHigh) {
                    continue;
                }
                let binIndex = Math.floor((vd.price - lowestLow) / stepSize);
                if (binIndex < 0) binIndex = 0;
                if (binIndex >= bins) binIndex = bins - 1;
                vols[binIndex] += vd.volume;
                if (vols[binIndex] > maxVol) {
                    maxVol = vols[binIndex];
                }
            }
            if (end < endIndex) {
                requestAnimationFrame(() => processVolumeDataChunk(end, Math.min(end + chunkSize, endIndex)));
            } else {
                requestAnimationFrame(() =>drawVolumeProfile());
            }
        }
        const drawVolumeProfile = ()=> {
            let max_bar_width = this.overlayCanvasVP.width * this.options.volumeProfile.width_percentage_vp / 100;
            ctx1.beginPath();
            for (let i = 0; i < bins; i++) {
                let volWidth = (vols[i] / maxVol) * max_bar_width;
                let rectHeight = ranges[i + 1] - ranges[i];
                ctx1.rect(this.overlayCanvasVP.width - volWidth, ranges[i], volWidth, rectHeight);
                let fontSize = Math.max(10, rectHeight / 2);
                ctx1.font = `${fontSize}px Arial`;
                ctx1.fillStyle = this.options.volumeProfile.textColor;
                ctx1.textAlign = 'right';
                ctx1.textBaseline = 'middle';
                let volumeText = vols[i].toFixed(0);
                ctx1.fillText(volumeText, this.overlayCanvasVP.width - volWidth - 5, (ranges[i] + ranges[i + 1]) / 2);
            }
            ctx1.fillStyle = this.options.volumeProfile.color;
            ctx1.fill();
            ctx1.closePath();
            this.releaseRedraw();
        }
        processVolumeDataChunk(startIndex, Math.min(startIndex + 500, endIndex));
    }
    clearCanvas(canvas_){
        canvas_.getContext('2d').clearRect(0, 0, canvas_.width, canvas_.height);
    }
    logger(log){
        console.log(log)
    }
    onMouseWheelEnd() {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
        if (!this.redrawScheduled) {
            this.timeoutId = setTimeout(() => {
                this.scheduleRedraw();
            }, 1000);
        }
    }
    scheduleRedraw() {
        if (!this.redrawScheduled) {
            this.redrawScheduled = true;
            requestAnimationFrame(() => {
                this.redrawOverlayAsync();
            });
        }
    }
    redrawOverlayAsync() {
        const ctx = this.overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        const ctx1 = this.overlayCanvasVP.getContext('2d');
        ctx1.clearRect(0, 0, this.overlayCanvasVP.width, this.overlayCanvasVP.height);
        let stepIndex = 0;
        const steps = [
            () => this.redrawVerticalRectangle(),
            () => this.redrawCircles(),
            () => this.redrawRectangles(),
            () => this.volumeProfile(this.options.volumeProfile.bins),
        ];
        function executeStep() {
            if (stepIndex < steps.length) {
                steps[stepIndex]();
                stepIndex++;
                requestAnimationFrame(executeStep);
            }
        }
        executeStep();


    }
    releaseRedraw(){
        this.redrawScheduled = false;
    }
    getVisibleData(data) {
        const timeRange = this.chart.timeScale().getVisibleRange();
        if (!timeRange) return [];
        return data.filter(item => item.time >= timeRange.from && item.time <= timeRange.to);
    }
    coordinateToTime(coord) {
        const timeScale_ = this.chart.timeScale();
        const time_ = timeScale_.coordinateToTime(coord);
        return time_ !== null ? time_ : null;
    }
    timeToCoordinate(time, triggered = null) {
        const timeScale = this.chart.timeScale();
        let time_ = time;
        if (triggered !== null){
            if (triggered === false){
                time_ = this.series.data().at(-1).time;
            }
        }
        const coordinate = timeScale.timeToCoordinate(time_);
        return coordinate !== null ? coordinate : null;
    }
    priceToCoordinate(price) {
        const coordinate = this.series.priceToCoordinate(price);
        return coordinate !== null ? coordinate : null;
    }
    coordinateToPrice(coord_){
        const price__ = this.series.coordinateToPrice(coord_);
        return price__ !== null ? price__ : null;
    }
    set_date(date) {
        return Date.parse(date) / 1000;
    }
    darkenColor(color, amount,opacity) {
        const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([0-9\.]+)?\)/i);
        if (rgbaMatch) {
            let r = parseInt(rgbaMatch[1]);
            let g = parseInt(rgbaMatch[2]);
            let b = parseInt(rgbaMatch[3]);
            r = Math.max(0, r - r * amount);
            g = Math.max(0, g - g * amount);
            b = Math.max(0, b - b * amount);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        } else {
            console.warn('Invalid color format. Expected rgba or rgb.');
            return color;
        }
    }
    lightenColor(color, amount,opacity) {
        const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([0-9\.]+)?\)/i);
        if (rgbaMatch) {
            let r = parseInt(rgbaMatch[1]);
            let g = parseInt(rgbaMatch[2]);
            let b = parseInt(rgbaMatch[3]);
            r = Math.min(255, r + (255 - r) * amount);
            g = Math.min(255, g + (255 - g) * amount);
            b = Math.min(255, b + (255 - b) * amount);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        } else {
            console.warn('Invalid color format. Expected rgba or rgb.');
            return color;
        }
    }
}