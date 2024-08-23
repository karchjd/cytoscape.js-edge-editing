(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["cytoscapeEdgeEditing"] = factory();
	else
		root["cytoscapeEdgeEditing"] = factory();
})(self, function() {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 347:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var debounce = __webpack_require__(218);
var anchorPointUtilities = __webpack_require__(259);
var reconnectionUtilities = __webpack_require__(171);
var registerUndoRedoFunctions = __webpack_require__(961);
var stageId = 0;

module.exports = function (params, cy) {
  var fn = params;

  anchorPointUtilities.options = params;

  var addBendPointCxtMenuId = 'cy-edge-bend-editing-cxt-add-bend-point' + stageId;
  var removeBendPointCxtMenuId = 'cy-edge-bend-editing-cxt-remove-bend-point' + stageId;
  var removeAllBendPointCtxMenuId = 'cy-edge-bend-editing-cxt-remove-multiple-bend-point' + stageId;
  var addControlPointCxtMenuId = 'cy-edge-control-editing-cxt-add-control-point' + stageId;
  var removeControlPointCxtMenuId = 'cy-edge-control-editing-cxt-remove-control-point' + stageId;
  var removeAllControlPointCtxMenuId = 'cy-edge-bend-editing-cxt-remove-multiple-control-point' + stageId;
  var eStyle, eRemove, eAdd, eZoom, eSelect, eUnselect, eTapStart, eTapStartOnEdge, eTapDrag, eTapEnd, eCxtTap, eDrag, eData;
  // last status of gestures
  var lastPanningEnabled, lastZoomingEnabled, lastBoxSelectionEnabled;
  var lastActiveBgOpacity;
  // status of edge to highlight bends and selected edges
  var edgeToHighlight, numberOfSelectedEdges;

  // the Kanva.shape() for the endpoints
  var endpointShape1 = null,
      endpointShape2 = null;
  // used to stop certain cy listeners when interracting with anchors
  var anchorTouched = false;
  // used call eMouseDown of anchorManager if the mouse is out of the content on cy.on(tapend)
  var mouseOut;

  var functions = {
    init: function init() {
      // register undo redo functions
      registerUndoRedoFunctions(cy, anchorPointUtilities, params);

      var self = this;
      var opts = params;

      /*
        Make sure we don't append an element that already exists.
        This extension canvas uses the same html element as edge-editing.
        It makes sense since it also uses the same Konva stage.
        Without the below logic, an empty canvasElement would be created
        for one of these extensions for no reason.
      */
      var $container = $(this);
      var canvasElementId = 'cy-node-edge-editing-stage' + stageId;
      stageId++;
      var $canvasElement = $('<div id="' + canvasElementId + '"></div>');

      if ($container.find('#' + canvasElementId).length < 1) {
        $container.append($canvasElement);
      }

      /* 
        Maintain a single Konva.stage object throughout the application that uses this extension
        such as Newt. This is important since having different stages causes weird behavior
        on other extensions that also use Konva, like not listening to mouse clicks and such.
        If you are someone that is creating an extension that uses Konva in the future, you need to
        be careful about how events register. If you use a different stage almost certainly one
        or both of the extensions that use the stage created below will break.
      */
      var stage;
      if (Konva.stages.length < stageId) {
        stage = new Konva.Stage({
          id: 'node-edge-editing-stage',
          container: canvasElementId, // id of container <div>
          width: $container.width(),
          height: $container.height()
        });
      } else {
        stage = Konva.stages[stageId - 1];
      }

      var canvas;
      if (stage.getChildren().length < 1) {
        canvas = new Konva.Layer();
        stage.add(canvas);
      } else {
        canvas = stage.getChildren()[0];
      }

      var anchorManager = {
        edge: undefined,
        edgeType: 'none',
        anchors: [],
        // remembers the touched anchor to avoid clearing it when dragging happens
        touchedAnchor: undefined,
        // remembers the index of the moving anchor
        touchedAnchorIndex: undefined,
        bindListeners: function bindListeners(anchor) {
          anchor.on("mousedown touchstart", this.eMouseDown);
        },
        unbindListeners: function unbindListeners(anchor) {
          anchor.off("mousedown touchstart", this.eMouseDown);
        },
        // gets trigger on clicking on context menus, while cy listeners don't get triggered
        // it can cause weird behaviour if not aware of this
        eMouseDown: function eMouseDown(event) {
          // anchorManager.edge.unselect() won't work sometimes if this wasn't here
          cy.autounselectify(false);

          // eMouseDown(set) -> tapdrag(used) -> eMouseUp(reset)
          anchorTouched = true;
          anchorManager.touchedAnchor = event.target;
          mouseOut = false;
          anchorManager.edge.unselect();

          // remember state before changing
          var weightStr = anchorPointUtilities.syntax[anchorManager.edgeType]['weight'];
          var distanceStr = anchorPointUtilities.syntax[anchorManager.edgeType]['distance'];

          var edge = anchorManager.edge;
          moveAnchorParam = {
            edge: edge,
            type: anchorManager.edgeType,
            weights: edge.data(weightStr) ? [].concat(edge.data(weightStr)) : [],
            distances: edge.data(distanceStr) ? [].concat(edge.data(distanceStr)) : []
          };

          turnOffActiveBgColor();
          disableGestures();

          cy.autoungrabify(true);

          canvas.getStage().on("contentTouchend contentMouseup", anchorManager.eMouseUp);
          canvas.getStage().on("contentMouseout", anchorManager.eMouseOut);
        },
        // gets called before cy.on('tapend')
        eMouseUp: function eMouseUp(event) {
          // won't be called if the mouse is released out of screen
          anchorTouched = false;
          anchorManager.touchedAnchor = undefined;
          mouseOut = false;
          anchorManager.edge.select();

          resetActiveBgColor();
          resetGestures();

          /* 
           * IMPORTANT
           * Any programmatic calls to .select(), .unselect() after this statement are ignored
           * until cy.autounselectify(false) is called in one of the previous:
           * 
           * cy.on('tapstart')
           * anchor.on('mousedown touchstart')
           * document.on('keydown')
           * cy.on('tapdrap')
           * 
           * Doesn't affect UX, but may cause confusing behaviour if not aware of this when coding
           * 
           * Why is this here?
           * This is important to keep edges from being auto deselected from working
           * with anchors out of the edge body (for unbundled bezier, technically not necessery for segements).
           * 
           * These is anther cy.autoselectify(true) in cy.on('tapend') 
           * 
          */
          cy.autounselectify(true);
          cy.autoungrabify(false);

          canvas.getStage().off("contentTouchend contentMouseup", anchorManager.eMouseUp);
          canvas.getStage().off("contentMouseout", anchorManager.eMouseOut);
        },
        // handle mouse going out of canvas 
        eMouseOut: function eMouseOut(event) {
          mouseOut = true;
        },
        clearAnchorsExcept: function clearAnchorsExcept() {
          var _this = this;

          var dontClean = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;

          var exceptionApplies = false;

          this.anchors.forEach(function (anchor, index) {
            if (dontClean && anchor === dontClean) {
              exceptionApplies = true; // the dontClean anchor is not cleared
              return;
            }

            _this.unbindListeners(anchor);
            anchor.destroy();
          });

          if (exceptionApplies) {
            this.anchors = [dontClean];
          } else {
            this.anchors = [];
            this.edge = undefined;
            this.edgeType = 'none';
          }
        },
        // render the bend and control shapes of the given edge
        renderAnchorShapes: function renderAnchorShapes(edge) {
          this.edge = edge;
          this.edgeType = anchorPointUtilities.getEdgeType(edge);

          if (!edge.hasClass('edgebendediting-hasbendpoints') && !edge.hasClass('edgecontrolediting-hascontrolpoints')) {
            return;
          }

          var anchorList = anchorPointUtilities.getAnchorsAsArray(edge); //edge._private.rdata.segpts;
          var length = getAnchorShapesLength(edge) * 0.65;

          var srcPos = edge.source().position();
          var tgtPos = edge.target().position();

          for (var i = 0; anchorList && i < anchorList.length; i = i + 2) {
            var anchorX = anchorList[i];
            var anchorY = anchorList[i + 1];

            this.renderAnchorShape(anchorX, anchorY, length);
          }

          canvas.draw();
        },
        // render a anchor shape with the given parameters
        renderAnchorShape: function renderAnchorShape(anchorX, anchorY, length) {
          // get the top left coordinates
          var topLeftX = anchorX - length / 2;
          var topLeftY = anchorY - length / 2;

          // convert to rendered parameters
          var renderedTopLeftPos = convertToRenderedPosition({ x: topLeftX, y: topLeftY });
          length *= cy.zoom();

          var newAnchor = new Konva.Rect({
            x: renderedTopLeftPos.x,
            y: renderedTopLeftPos.y,
            width: length,
            height: length,
            fill: 'black',
            strokeWidth: 0,
            draggable: true
          });

          this.anchors.push(newAnchor);
          this.bindListeners(newAnchor);
          canvas.add(newAnchor);
        }
      };

      var cxtAddBendFcn = function cxtAddBendFcn(event) {
        cxtAddAnchorFcn(event, 'bend');
      };

      var cxtAddControlFcn = function cxtAddControlFcn(event) {
        cxtAddAnchorFcn(event, 'control');
      };

      var cxtAddAnchorFcn = function cxtAddAnchorFcn(event, anchorType) {
        var edge = event.target || event.cyTarget;
        if (!anchorPointUtilities.isIgnoredEdge(edge)) {

          var type = anchorPointUtilities.getEdgeType(edge);
          var weights, distances, weightStr, distanceStr;

          if (type === 'none') {
            weights = [];
            distances = [];
          } else {
            weightStr = anchorPointUtilities.syntax[type]['weight'];
            distanceStr = anchorPointUtilities.syntax[type]['distance'];

            weights = edge.data(weightStr) ? [].concat(edge.data(weightStr)) : edge.data(weightStr);
            distances = edge.data(distanceStr) ? [].concat(edge.data(distanceStr)) : edge.data(distanceStr);
          }

          var param = {
            edge: edge,
            type: type,
            weights: weights,
            distances: distances
          };

          // the undefined go for edge and newAnchorPoint parameters
          anchorPointUtilities.addAnchorPoint(undefined, undefined, anchorType);

          if (options().undoable) {
            cy.undoRedo().do('changeAnchorPoints', param);
          }
        }

        refreshDraws();
        edge.select();
      };

      var cxtRemoveAnchorFcn = function cxtRemoveAnchorFcn(event) {
        var edge = anchorManager.edge;
        var type = anchorPointUtilities.getEdgeType(edge);

        if (anchorPointUtilities.edgeTypeNoneShouldntHappen(type, "UiUtilities.js, cxtRemoveAnchorFcn")) {
          return;
        }

        var param = {
          edge: edge,
          type: type,
          weights: [].concat(edge.data(anchorPointUtilities.syntax[type]['weight'])),
          distances: [].concat(edge.data(anchorPointUtilities.syntax[type]['distance']))
        };

        anchorPointUtilities.removeAnchor();

        if (options().undoable) {
          cy.undoRedo().do('changeAnchorPoints', param);
        }

        setTimeout(function () {
          refreshDraws();edge.select();
        }, 50);
      };

      var cxtRemoveAllAnchorsFcn = function cxtRemoveAllAnchorsFcn(event) {
        var edge = anchorManager.edge;
        var type = anchorPointUtilities.getEdgeType(edge);
        var param = {
          edge: edge,
          type: type,
          weights: [].concat(edge.data(anchorPointUtilities.syntax[type]['weight'])),
          distances: [].concat(edge.data(anchorPointUtilities.syntax[type]['distance']))
        };

        anchorPointUtilities.removeAllAnchors();

        if (options().undoable) {
          cy.undoRedo().do('changeAnchorPoints', param);
        }
        setTimeout(function () {
          refreshDraws();edge.select();
        }, 50);
      };

      // function to reconnect edge
      var handleReconnectEdge = opts.handleReconnectEdge;
      // function to validate edge source and target on reconnection
      var validateEdge = opts.validateEdge;
      // function to be called on invalid edge reconnection
      var actOnUnsuccessfulReconnection = opts.actOnUnsuccessfulReconnection;

      var menuItems = [{
        id: addBendPointCxtMenuId,
        content: opts.addBendMenuItemTitle,
        selector: 'edge',
        onClickFunction: cxtAddBendFcn,
        hasTrailingDivider: opts.useTrailingDividersAfterContextMenuOptions
      }, {
        id: removeBendPointCxtMenuId,
        content: opts.removeBendMenuItemTitle,
        selector: 'edge',
        onClickFunction: cxtRemoveAnchorFcn,
        hasTrailingDivider: opts.useTrailingDividersAfterContextMenuOptions
      }, {
        id: removeAllBendPointCtxMenuId,
        content: opts.removeAllBendMenuItemTitle,
        selector: opts.enableMultipleAnchorRemovalOption && ':selected.edgebendediting-hasmultiplebendpoints',
        onClickFunction: cxtRemoveAllAnchorsFcn,
        hasTrailingDivider: opts.useTrailingDividersAfterContextMenuOptions
      }, {
        id: addControlPointCxtMenuId,
        content: opts.addControlMenuItemTitle,
        selector: 'edge',
        coreAsWell: true,
        onClickFunction: cxtAddControlFcn,
        hasTrailingDivider: opts.useTrailingDividersAfterContextMenuOptions
      }, {
        id: removeControlPointCxtMenuId,
        content: opts.removeControlMenuItemTitle,
        selector: 'edge',
        coreAsWell: true,
        onClickFunction: cxtRemoveAnchorFcn,
        hasTrailingDivider: opts.useTrailingDividersAfterContextMenuOptions
      }, {
        id: removeAllControlPointCtxMenuId,
        content: opts.removeAllControlMenuItemTitle,
        selector: opts.enableMultipleAnchorRemovalOption && ':selected.edgecontrolediting-hasmultiplecontrolpoints',
        onClickFunction: cxtRemoveAllAnchorsFcn,
        hasTrailingDivider: opts.useTrailingDividersAfterContextMenuOptions
      }];

      if (cy.contextMenus) {
        var menus = cy.contextMenus('get');
        // If context menus is active just append menu items else activate the extension
        // with initial menu items
        if (menus.isActive()) {
          menus.appendMenuItems(menuItems);
        } else {
          cy.contextMenus({
            menuItems: menuItems
          });
        }
      }

      var _sizeCanvas = debounce(function () {
        $canvasElement.attr('height', $container.height()).attr('width', $container.width()).css({
          'position': 'absolute',
          'top': 0,
          'left': 0,
          'z-index': options().zIndex
        });

        setTimeout(function () {
          var canvasBb = $canvasElement.offset();
          var containerBb = $container.offset();

          $canvasElement.css({
            'top': -(canvasBb.top - containerBb.top),
            'left': -(canvasBb.left - containerBb.left)
          });

          canvas.getStage().setWidth($container.width());
          canvas.getStage().setHeight($container.height());

          // redraw on canvas resize
          if (cy) {
            refreshDraws();
          }
        }, 0);
      }, 250);

      function sizeCanvas() {
        _sizeCanvas();
      }

      sizeCanvas();

      $(window).bind('resize', function () {
        sizeCanvas();
      });

      // write options to data
      var data = $container.data('cyedgeediting');
      if (data == null) {
        data = {};
      }
      data.options = opts;

      var optCache;

      function options() {
        return optCache || (optCache = $container.data('cyedgeediting').options);
      }

      // we will need to convert model positons to rendered positions
      function convertToRenderedPosition(modelPosition) {
        var pan = cy.pan();
        var zoom = cy.zoom();

        var x = modelPosition.x * zoom + pan.x;
        var y = modelPosition.y * zoom + pan.y;

        return {
          x: x,
          y: y
        };
      }

      function refreshDraws() {

        // don't clear anchor which is being moved
        anchorManager.clearAnchorsExcept(anchorManager.touchedAnchor);

        if (endpointShape1 !== null) {
          endpointShape1.destroy();
          endpointShape1 = null;
        }
        if (endpointShape2 !== null) {
          endpointShape2.destroy();
          endpointShape2 = null;
        }
        canvas.draw();

        if (edgeToHighlight) {
          anchorManager.renderAnchorShapes(edgeToHighlight);
          renderEndPointShapes(edgeToHighlight);
        }
      }

      // render the end points shapes of the given edge
      function renderEndPointShapes(edge) {
        if (!edge) {
          return;
        }

        var edge_pts = anchorPointUtilities.getAnchorsAsArray(edge);
        if (typeof edge_pts === 'undefined') {
          edge_pts = [];
        }
        var sourcePos = edge.sourceEndpoint();
        var targetPos = edge.targetEndpoint();

        // This function is called inside refreshDraws which is called
        // for updating Konva shapes on events, but sometimes these values
        // will be NaN and Konva will show warnings in console as a result
        // This is a check to eliminate those cases since if these values 
        // are NaN nothing will be drawn anyway.
        if (!sourcePos.x || !targetPos.x) {
          return;
        }

        edge_pts.unshift(sourcePos.y);
        edge_pts.unshift(sourcePos.x);
        edge_pts.push(targetPos.x);
        edge_pts.push(targetPos.y);

        if (!edge_pts) return;

        var src = {
          x: edge_pts[0],
          y: edge_pts[1]
        };

        var target = {
          x: edge_pts[edge_pts.length - 2],
          y: edge_pts[edge_pts.length - 1]
        };

        var nextToSource = {
          x: edge_pts[2],
          y: edge_pts[3]
        };
        var nextToTarget = {
          x: edge_pts[edge_pts.length - 4],
          y: edge_pts[edge_pts.length - 3]
        };
        var length = getAnchorShapesLength(edge) * 0.65;

        renderEachEndPointShape(src, target, length, nextToSource, nextToTarget);
      }

      function renderEachEndPointShape(source, target, length, nextToSource, nextToTarget) {
        // get the top left coordinates of source and target
        var sTopLeftX = source.x - length / 2;
        var sTopLeftY = source.y - length / 2;

        var tTopLeftX = target.x - length / 2;
        var tTopLeftY = target.y - length / 2;

        var nextToSourceX = nextToSource.x - length / 2;
        var nextToSourceY = nextToSource.y - length / 2;

        var nextToTargetX = nextToTarget.x - length / 2;
        var nextToTargetY = nextToTarget.y - length / 2;

        // convert to rendered parameters
        var renderedSourcePos = convertToRenderedPosition({ x: sTopLeftX, y: sTopLeftY });
        var renderedTargetPos = convertToRenderedPosition({ x: tTopLeftX, y: tTopLeftY });
        length = length * cy.zoom() / 2;

        var renderedNextToSource = convertToRenderedPosition({ x: nextToSourceX, y: nextToSourceY });
        var renderedNextToTarget = convertToRenderedPosition({ x: nextToTargetX, y: nextToTargetY });

        //how far to go from the node along the edge
        var distanceFromNode = length;

        var distanceSource = Math.sqrt(Math.pow(renderedNextToSource.x - renderedSourcePos.x, 2) + Math.pow(renderedNextToSource.y - renderedSourcePos.y, 2));
        var sourceEndPointX = renderedSourcePos.x + distanceFromNode / distanceSource * (renderedNextToSource.x - renderedSourcePos.x);
        var sourceEndPointY = renderedSourcePos.y + distanceFromNode / distanceSource * (renderedNextToSource.y - renderedSourcePos.y);

        var distanceTarget = Math.sqrt(Math.pow(renderedNextToTarget.x - renderedTargetPos.x, 2) + Math.pow(renderedNextToTarget.y - renderedTargetPos.y, 2));
        var targetEndPointX = renderedTargetPos.x + distanceFromNode / distanceTarget * (renderedNextToTarget.x - renderedTargetPos.x);
        var targetEndPointY = renderedTargetPos.y + distanceFromNode / distanceTarget * (renderedNextToTarget.y - renderedTargetPos.y);

        // render end point shape for source and target
        // the null checks are not theoretically required
        // but they protect from bad synchronious calls of refreshDraws()
        if (endpointShape1 === null) {
          endpointShape1 = new Konva.Circle({
            x: sourceEndPointX + length,
            y: sourceEndPointY + length,
            radius: length,
            fill: 'black'
          });
        }

        if (endpointShape2 === null) {
          endpointShape2 = new Konva.Circle({
            x: targetEndPointX + length,
            y: targetEndPointY + length,
            radius: length,
            fill: 'black'
          });
        }

        canvas.add(endpointShape1);
        canvas.add(endpointShape2);
        canvas.draw();
      }

      // get the length of anchor points to be rendered
      function getAnchorShapesLength(edge) {
        var factor = options().anchorShapeSizeFactor;
        if (parseFloat(edge.css('width')) <= 2.5) return 2.5 * factor;else return parseFloat(edge.css('width')) * factor;
      }

      // check if the anchor represented by {x, y} is inside the point shape
      function checkIfInsideShape(x, y, length, centerX, centerY) {
        var minX = centerX - length / 2;
        var maxX = centerX + length / 2;
        var minY = centerY - length / 2;
        var maxY = centerY + length / 2;

        var inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
        return inside;
      }

      // get the index of anchor containing the point represented by {x, y}
      function getContainingShapeIndex(x, y, edge) {
        var type = anchorPointUtilities.getEdgeType(edge);

        if (type === 'none') {
          return -1;
        }

        if (edge.data(anchorPointUtilities.syntax[type]['weight']) == null || edge.data(anchorPointUtilities.syntax[type]['weight']).length == 0) {
          return -1;
        }

        var anchorList = anchorPointUtilities.getAnchorsAsArray(edge); //edge._private.rdata.segpts;
        var length = getAnchorShapesLength(edge);

        for (var i = 0; anchorList && i < anchorList.length; i = i + 2) {
          var anchorX = anchorList[i];
          var anchorY = anchorList[i + 1];

          var inside = checkIfInsideShape(x, y, length, anchorX, anchorY);
          if (inside) {
            return i / 2;
          }
        }

        return -1;
      };

      function getContainingEndPoint(x, y, edge) {
        var length = getAnchorShapesLength(edge);
        var allPts = edge._private.rscratch.allpts;
        var src = {
          x: allPts[0],
          y: allPts[1]
        };
        var target = {
          x: allPts[allPts.length - 2],
          y: allPts[allPts.length - 1]
        };
        convertToRenderedPosition(src);
        convertToRenderedPosition(target);

        // Source:0, Target:1, None:-1
        if (checkIfInsideShape(x, y, length, src.x, src.y)) return 0;else if (checkIfInsideShape(x, y, length, target.x, target.y)) return 1;else return -1;
      }

      // store the current status of gestures and set them to false
      function disableGestures() {
        lastPanningEnabled = cy.panningEnabled();
        lastZoomingEnabled = cy.zoomingEnabled();
        lastBoxSelectionEnabled = cy.boxSelectionEnabled();

        cy.zoomingEnabled(false).panningEnabled(false).boxSelectionEnabled(false);
      }

      // reset the gestures by their latest status
      function resetGestures() {
        cy.zoomingEnabled(lastZoomingEnabled).panningEnabled(lastPanningEnabled).boxSelectionEnabled(lastBoxSelectionEnabled);
      }

      function turnOffActiveBgColor() {
        // found this at the cy-node-resize code, but doesn't seem to find the object most of the time
        if (cy.style()._private.coreStyle["active-bg-opacity"]) {
          lastActiveBgOpacity = cy.style()._private.coreStyle["active-bg-opacity"].value;
        } else {
          // arbitrary, feel free to change
          // trial and error showed that 0.15 was closest to the old color
          lastActiveBgOpacity = 0.15;
        }

        cy.style().selector("core").style("active-bg-opacity", 0).update();
      }

      function resetActiveBgColor() {
        cy.style().selector("core").style("active-bg-opacity", lastActiveBgOpacity).update();
      }

      function moveAnchorPoints(positionDiff, edges) {
        edges.forEach(function (edge) {
          var previousAnchorsPosition = anchorPointUtilities.getAnchorsAsArray(edge);
          var nextAnchorPointsPosition = [];
          if (previousAnchorsPosition != undefined) {
            for (var i = 0; i < previousAnchorsPosition.length; i += 2) {
              nextAnchorPointsPosition.push({ x: previousAnchorsPosition[i] + positionDiff.x, y: previousAnchorsPosition[i + 1] + positionDiff.y });
            }
            var type = anchorPointUtilities.getEdgeType(edge);

            if (anchorPointUtilities.edgeTypeNoneShouldntHappen(type, "UiUtilities.js, moveAnchorPoints")) {
              return;
            }

            if (type === 'bend') {
              params.bendPointPositionsSetterFunction(edge, nextAnchorPointsPosition);
            } else if (type === 'control') {
              params.controlPointPositionsSetterFunction(edge, nextAnchorPointsPosition);
            }
          }
        });
        anchorPointUtilities.initAnchorPoints(options().bendPositionsFunction, options().controlPositionsFunction, edges);

        // Listener defined in other extension
        // Might have compatibility issues after the unbundled bezier
        cy.trigger('bendPointMovement');
      }

      function moveAnchorOnDrag(edge, type, index, position) {
        var weights = edge.data(anchorPointUtilities.syntax[type]['weight']);
        var distances = edge.data(anchorPointUtilities.syntax[type]['distance']);

        var relativeAnchorPosition = anchorPointUtilities.convertToRelativePosition(edge, position);
        weights[index] = relativeAnchorPosition.weight;
        distances[index] = relativeAnchorPosition.distance;

        edge.data(anchorPointUtilities.syntax[type]['weight'], weights);
        edge.data(anchorPointUtilities.syntax[type]['distance'], distances);
      }

      // debounced due to large amout of calls to tapdrag
      var _moveAnchorOnDrag = debounce(moveAnchorOnDrag, 5);

      {
        lastPanningEnabled = cy.panningEnabled();
        lastZoomingEnabled = cy.zoomingEnabled();
        lastBoxSelectionEnabled = cy.boxSelectionEnabled();

        // Initilize the edgeToHighlightBends and numberOfSelectedEdges
        {
          var selectedEdges = cy.edges(':selected');
          var numberOfSelectedEdges = selectedEdges.length;

          if (numberOfSelectedEdges === 1) {
            edgeToHighlight = selectedEdges[0];
          }
        }

        cy.bind('zoom pan', eZoom = function eZoom() {
          if (!edgeToHighlight) {
            return;
          }

          refreshDraws();
        });

        cy.on('data', 'edge', eData = function eData() {
          if (!edgeToHighlight) {
            return;
          }

          refreshDraws();
        });

        cy.on('style', 'edge.edgebendediting-hasbendpoints:selected, edge.edgecontrolediting-hascontrolpoints:selected', eStyle = function eStyle() {
          setTimeout(function () {
            refreshDraws();
          }, 50);
        });

        cy.on('remove', 'edge', eRemove = function eRemove() {
          var edge = this;
          if (edge.selected()) {
            numberOfSelectedEdges = numberOfSelectedEdges - 1;

            cy.startBatch();

            if (edgeToHighlight) {
              edgeToHighlight.removeClass('cy-edge-editing-highlight');
            }

            if (numberOfSelectedEdges === 1) {
              var selectedEdges = cy.edges(':selected');

              // If user removes all selected edges at a single operation then our 'numberOfSelectedEdges'
              // may be misleading. Therefore we need to check if the number of edges to highlight is realy 1 here.
              if (selectedEdges.length === 1) {
                edgeToHighlight = selectedEdges[0];
                edgeToHighlight.addClass('cy-edge-editing-highlight');
              } else {
                edgeToHighlight = undefined;
              }
            } else {
              edgeToHighlight = undefined;
            }

            cy.endBatch();
          }
          refreshDraws();
        });

        cy.on('add', 'edge', eAdd = function eAdd() {
          var edge = this;
          if (edge.selected()) {
            numberOfSelectedEdges = numberOfSelectedEdges + 1;

            cy.startBatch();

            if (edgeToHighlight) {
              edgeToHighlight.removeClass('cy-edge-editing-highlight');
            }

            if (numberOfSelectedEdges === 1) {
              edgeToHighlight = edge;
              edgeToHighlight.addClass('cy-edge-editing-highlight');
            } else {
              edgeToHighlight = undefined;
            }

            cy.endBatch();
          }
          refreshDraws();
        });

        cy.on('select', 'edge', eSelect = function eSelect() {
          var edge = this;

          if (edge.target().connectedEdges().length == 0 || edge.source().connectedEdges().length == 0) {
            return;
          }

          numberOfSelectedEdges = numberOfSelectedEdges + 1;

          cy.startBatch();

          if (edgeToHighlight) {
            edgeToHighlight.removeClass('cy-edge-editing-highlight');
          }

          if (numberOfSelectedEdges === 1) {
            edgeToHighlight = edge;
            edgeToHighlight.addClass('cy-edge-editing-highlight');
          } else {
            edgeToHighlight = undefined;
          }

          cy.endBatch();
          refreshDraws();
        });

        cy.on('unselect', 'edge', eUnselect = function eUnselect() {
          numberOfSelectedEdges = numberOfSelectedEdges - 1;

          cy.startBatch();

          if (edgeToHighlight) {
            edgeToHighlight.removeClass('cy-edge-editing-highlight');
          }

          if (numberOfSelectedEdges === 1) {
            var selectedEdges = cy.edges(':selected');

            // If user unselects all edges by tapping to the core etc. then our 'numberOfSelectedEdges'
            // may be misleading. Therefore we need to check if the number of edges to highlight is realy 1 here.
            if (selectedEdges.length === 1) {
              edgeToHighlight = selectedEdges[0];
              edgeToHighlight.addClass('cy-edge-editing-highlight');
            } else {
              edgeToHighlight = undefined;
            }
          } else {
            edgeToHighlight = undefined;
          }

          cy.endBatch();
          refreshDraws();
        });

        var movedAnchorIndex;
        var tapStartPos;
        var movedEdge;
        var moveAnchorParam;
        var createAnchorOnDrag;
        var movedEndPoint;
        var dummyNode;
        var detachedNode;
        var nodeToAttach;
        var anchorCreatedByDrag = false;

        cy.on('tapstart', eTapStart = function eTapStart(event) {
          tapStartPos = event.position || event.cyPosition;
        });

        cy.on('tapstart', 'edge', eTapStartOnEdge = function eTapStartOnEdge(event) {
          var edge = this;

          if (!edgeToHighlight || edgeToHighlight.id() !== edge.id()) {
            createAnchorOnDrag = false;
            return;
          }

          movedEdge = edge;

          var type = anchorPointUtilities.getEdgeType(edge);

          // to avoid errors
          if (type === 'none') type = 'bend';

          var cyPosX = tapStartPos.x;
          var cyPosY = tapStartPos.y;

          // Get which end point has been clicked (Source:0, Target:1, None:-1)
          var endPoint = getContainingEndPoint(cyPosX, cyPosY, edge);

          if (endPoint == 0 || endPoint == 1) {
            edge.unselect();
            movedEndPoint = endPoint;
            detachedNode = endPoint == 0 ? movedEdge.source() : movedEdge.target();

            var disconnectedEnd = endPoint == 0 ? 'source' : 'target';
            var result = reconnectionUtilities.disconnectEdge(movedEdge, cy, event.renderedPosition, disconnectedEnd);

            dummyNode = result.dummyNode;
            movedEdge = result.edge;

            disableGestures();
          } else {
            movedAnchorIndex = undefined;
            createAnchorOnDrag = true;
          }
        });

        cy.on('drag', 'node', eDrag = function eDrag() {
          if (edgeToHighlight) {
            refreshDraws();
          }
        });
        cy.on('tapdrag', eTapDrag = function eTapDrag(event) {
          /** 
           * if there is a selected edge set autounselectify false
           * fixes the node-editing problem where nodes would get
           * unselected after resize drag
          */
          if (cy.edges(':selected').length > 0) {
            cy.autounselectify(false);
          }
          var edge = movedEdge;

          if (movedEdge !== undefined && anchorPointUtilities.isIgnoredEdge(edge)) {
            return;
          }

          var type = anchorPointUtilities.getEdgeType(edge);

          if (createAnchorOnDrag && opts.enableCreateAnchorOnDrag && !anchorTouched && type !== 'none') {
            // remember state before creating anchor
            var weightStr = anchorPointUtilities.syntax[type]['weight'];
            var distanceStr = anchorPointUtilities.syntax[type]['distance'];

            moveAnchorParam = {
              edge: edge,
              type: type,
              weights: edge.data(weightStr) ? [].concat(edge.data(weightStr)) : [],
              distances: edge.data(distanceStr) ? [].concat(edge.data(distanceStr)) : []
            };

            edge.unselect();

            // using tapstart position fixes bug on quick drags
            // --- 
            // also modified addAnchorPoint to return the index because
            // getContainingShapeIndex failed to find the created anchor on quick drags
            movedAnchorIndex = anchorPointUtilities.addAnchorPoint(edge, tapStartPos);
            movedEdge = edge;
            createAnchorOnDrag = undefined;
            anchorCreatedByDrag = true;
            disableGestures();
          }

          // if the tapstart did not hit an edge and it did not hit an anchor
          if (!anchorTouched && (movedEdge === undefined || movedAnchorIndex === undefined && movedEndPoint === undefined)) {
            return;
          }

          var eventPos = event.position || event.cyPosition;

          // Update end point location (Source:0, Target:1)
          if (movedEndPoint != -1 && dummyNode) {
            dummyNode.position(eventPos);
          }
          // change location of anchor created by drag
          else if (movedAnchorIndex != undefined) {
              _moveAnchorOnDrag(edge, type, movedAnchorIndex, eventPos);
            }
            // change location of drag and dropped anchor
            else if (anchorTouched) {

                // the tapStartPos check is necessary when righ clicking anchor points
                // right clicking anchor points triggers MouseDown for Konva, but not tapstart for cy
                // when that happens tapStartPos is undefined
                if (anchorManager.touchedAnchorIndex === undefined && tapStartPos) {
                  anchorManager.touchedAnchorIndex = getContainingShapeIndex(tapStartPos.x, tapStartPos.y, anchorManager.edge);
                }

                if (anchorManager.touchedAnchorIndex !== undefined) {
                  _moveAnchorOnDrag(anchorManager.edge, anchorManager.edgeType, anchorManager.touchedAnchorIndex, eventPos);
                }
              }

          if (event.target && event.target[0] && event.target.isNode()) {
            nodeToAttach = event.target;
          }
        });

        cy.on('tapend', eTapEnd = function eTapEnd(event) {

          if (mouseOut) {
            canvas.getStage().fire("contentMouseup");
          }

          var edge = movedEdge || anchorManager.edge;

          if (edge !== undefined) {
            var index = anchorManager.touchedAnchorIndex;
            if (index != undefined) {
              var startX = edge.source().position('x');
              var startY = edge.source().position('y');
              var endX = edge.target().position('x');
              var endY = edge.target().position('y');

              var anchorList = anchorPointUtilities.getAnchorsAsArray(edge);
              var allAnchors = [startX, startY].concat(anchorList).concat([endX, endY]);

              var anchorIndex = index + 1;
              var preIndex = anchorIndex - 1;
              var posIndex = anchorIndex + 1;

              var anchor = {
                x: allAnchors[2 * anchorIndex],
                y: allAnchors[2 * anchorIndex + 1]
              };

              var preAnchorPoint = {
                x: allAnchors[2 * preIndex],
                y: allAnchors[2 * preIndex + 1]
              };

              var posAnchorPoint = {
                x: allAnchors[2 * posIndex],
                y: allAnchors[2 * posIndex + 1]
              };

              var nearToLine;

              if (anchor.x === preAnchorPoint.x && anchor.y === preAnchorPoint.y || anchor.x === preAnchorPoint.x && anchor.y === preAnchorPoint.y) {
                nearToLine = true;
              } else {
                var m1 = (preAnchorPoint.y - posAnchorPoint.y) / (preAnchorPoint.x - posAnchorPoint.x);
                var m2 = -1 / m1;

                var srcTgtPointsAndTangents = {
                  srcPoint: preAnchorPoint,
                  tgtPoint: posAnchorPoint,
                  m1: m1,
                  m2: m2
                };

                var currentIntersection = anchorPointUtilities.getIntersection(edge, anchor, srcTgtPointsAndTangents);
                var dist = Math.sqrt(Math.pow(anchor.x - currentIntersection.x, 2) + Math.pow(anchor.y - currentIntersection.y, 2));

                // remove the bend point if segment edge becomes straight
                var type = anchorPointUtilities.getEdgeType(edge);
                if (type === 'bend' && dist < options().bendRemovalSensitivity) {
                  nearToLine = true;
                }
              }

              if (nearToLine) {
                anchorPointUtilities.removeAnchor(edge, index);
              }
            } else if (dummyNode != undefined && (movedEndPoint == 0 || movedEndPoint == 1)) {

              var newNode = detachedNode;
              var isValid = 'valid';
              var location = movedEndPoint == 0 ? 'source' : 'target';

              // validate edge reconnection
              if (nodeToAttach) {
                var newSource = movedEndPoint == 0 ? nodeToAttach : edge.source();
                var newTarget = movedEndPoint == 1 ? nodeToAttach : edge.target();
                if (typeof validateEdge === "function") isValid = validateEdge(edge, newSource, newTarget);
                newNode = isValid === 'valid' ? nodeToAttach : detachedNode;
              }

              var newSource = movedEndPoint == 0 ? newNode : edge.source();
              var newTarget = movedEndPoint == 1 ? newNode : edge.target();
              edge = reconnectionUtilities.connectEdge(edge, detachedNode, location);

              if (detachedNode.id() !== newNode.id()) {
                // use given handleReconnectEdge function 
                if (typeof handleReconnectEdge === 'function') {
                  var reconnectedEdge = handleReconnectEdge(newSource.id(), newTarget.id(), edge.data());

                  if (reconnectedEdge) {
                    reconnectionUtilities.copyEdge(edge, reconnectedEdge);
                    anchorPointUtilities.initAnchorPoints(options().bendPositionsFunction, options().controlPositionsFunction, [reconnectedEdge]);
                  }

                  if (reconnectedEdge && options().undoable) {
                    var params = {
                      newEdge: reconnectedEdge,
                      oldEdge: edge
                    };
                    cy.undoRedo().do('removeReconnectedEdge', params);
                    edge = reconnectedEdge;
                  } else if (reconnectedEdge) {
                    cy.remove(edge);
                    edge = reconnectedEdge;
                  }
                } else {
                  var loc = movedEndPoint == 0 ? { source: newNode.id() } : { target: newNode.id() };
                  var oldLoc = movedEndPoint == 0 ? { source: detachedNode.id() } : { target: detachedNode.id() };

                  if (options().undoable && newNode.id() !== detachedNode.id()) {
                    var param = {
                      edge: edge,
                      location: loc,
                      oldLoc: oldLoc
                    };
                    var result = cy.undoRedo().do('reconnectEdge', param);
                    edge = result.edge;
                    //edge.select();
                  }
                }
              }

              // invalid edge reconnection callback
              if (isValid !== 'valid' && typeof actOnUnsuccessfulReconnection === 'function') {
                actOnUnsuccessfulReconnection();
              }
              edge.select();
              cy.remove(dummyNode);
            }
          }
          var type = anchorPointUtilities.getEdgeType(edge);

          // to avoid errors
          if (type === 'none') {
            type = 'bend';
          }

          if (anchorManager.touchedAnchorIndex === undefined && !anchorCreatedByDrag) {
            moveAnchorParam = undefined;
          }

          var weightStr = anchorPointUtilities.syntax[type]['weight'];
          if (edge !== undefined && moveAnchorParam !== undefined && (edge.data(weightStr) ? edge.data(weightStr).toString() : null) != moveAnchorParam.weights.toString()) {

            // anchor created from drag
            if (anchorCreatedByDrag) {
              edge.select();

              // stops the unbundled bezier edges from being unselected
              cy.autounselectify(true);
            }

            if (options().undoable) {
              cy.undoRedo().do('changeAnchorPoints', moveAnchorParam);
            }
          }

          movedAnchorIndex = undefined;
          movedEdge = undefined;
          moveAnchorParam = undefined;
          createAnchorOnDrag = undefined;
          movedEndPoint = undefined;
          dummyNode = undefined;
          detachedNode = undefined;
          nodeToAttach = undefined;
          tapStartPos = undefined;
          anchorCreatedByDrag = false;

          anchorManager.touchedAnchorIndex = undefined;

          resetGestures();
          setTimeout(function () {
            refreshDraws();
          }, 50);
        });

        //Variables used for starting and ending the movement of anchor points with arrows
        var moveanchorparam;
        var firstAnchor;
        var edgeContainingFirstAnchor;
        var firstAnchorPointFound;
        cy.on("edgeediting.movestart", function (e, edges) {
          firstAnchorPointFound = false;
          if (edges[0] != undefined) {
            edges.forEach(function (edge) {
              if (anchorPointUtilities.getAnchorsAsArray(edge) != undefined && !firstAnchorPointFound) {
                firstAnchor = { x: anchorPointUtilities.getAnchorsAsArray(edge)[0], y: anchorPointUtilities.getAnchorsAsArray(edge)[1] };
                moveanchorparam = {
                  firstTime: true,
                  firstAnchorPosition: {
                    x: firstAnchor.x,
                    y: firstAnchor.y
                  },
                  edges: edges
                };
                edgeContainingFirstAnchor = edge;
                firstAnchorPointFound = true;
              }
            });
          }
        });

        cy.on("edgeediting.moveend", function (e, edges) {
          if (moveanchorparam != undefined) {
            var initialPos = moveanchorparam.firstAnchorPosition;
            var movedFirstAnchor = {
              x: anchorPointUtilities.getAnchorsAsArray(edgeContainingFirstAnchor)[0],
              y: anchorPointUtilities.getAnchorsAsArray(edgeContainingFirstAnchor)[1]
            };

            moveanchorparam.positionDiff = {
              x: -movedFirstAnchor.x + initialPos.x,
              y: -movedFirstAnchor.y + initialPos.y
            };

            delete moveanchorparam.firstAnchorPosition;

            if (options().undoable) {
              cy.undoRedo().do("moveAnchorPoints", moveanchorparam);
            }

            moveanchorparam = undefined;
          }
        });

        cy.on('cxttap', eCxtTap = function eCxtTap(event) {
          var target = event.target || event.cyTarget;
          var targetIsEdge = false;

          try {
            targetIsEdge = target.isEdge();
          } catch (err) {
            // this is here just to suppress the error
          }

          var edge, type;
          if (targetIsEdge) {
            edge = target;
            type = anchorPointUtilities.getEdgeType(edge);
          } else {
            edge = anchorManager.edge;
            type = anchorManager.edgeType;
          }

          var menus = cy.contextMenus('get'); // get context menus instance

          if (!edgeToHighlight || edgeToHighlight.id() != edge.id() || anchorPointUtilities.isIgnoredEdge(edge) || edgeToHighlight !== edge) {
            menus.hideMenuItem(removeBendPointCxtMenuId);
            menus.hideMenuItem(addBendPointCxtMenuId);
            menus.hideMenuItem(removeControlPointCxtMenuId);
            menus.hideMenuItem(addControlPointCxtMenuId);
            return;
          }

          var cyPos = event.position || event.cyPosition;
          var selectedIndex = getContainingShapeIndex(cyPos.x, cyPos.y, edge);
          // not clicked on an anchor
          if (selectedIndex == -1) {
            menus.hideMenuItem(removeBendPointCxtMenuId);
            menus.hideMenuItem(removeControlPointCxtMenuId);
            if (type === 'control' && targetIsEdge) {
              menus.showMenuItem(addControlPointCxtMenuId);
              menus.hideMenuItem(addBendPointCxtMenuId);
            } else if (type === 'bend' && targetIsEdge) {
              menus.showMenuItem(addBendPointCxtMenuId);
              menus.hideMenuItem(addControlPointCxtMenuId);
            } else if (targetIsEdge) {
              menus.showMenuItem(addBendPointCxtMenuId);
              menus.showMenuItem(addControlPointCxtMenuId);
            } else {
              menus.hideMenuItem(addBendPointCxtMenuId);
              menus.hideMenuItem(addControlPointCxtMenuId);
            }
            anchorPointUtilities.currentCtxPos = cyPos;
          }
          // clicked on an anchor
          else {
              menus.hideMenuItem(addBendPointCxtMenuId);
              menus.hideMenuItem(addControlPointCxtMenuId);
              if (type === 'control') {
                menus.showMenuItem(removeControlPointCxtMenuId);
                menus.hideMenuItem(removeBendPointCxtMenuId);
                if (opts.enableMultipleAnchorRemovalOption && edge.hasClass('edgecontrolediting-hasmultiplecontrolpoints')) {
                  menus.showMenuItem(removeAllControlPointCtxMenuId);
                }
              } else if (type === 'bend') {
                menus.showMenuItem(removeBendPointCxtMenuId);
                menus.hideMenuItem(removeControlPointCxtMenuId);
              } else {
                menus.hideMenuItem(removeBendPointCxtMenuId);
                menus.hideMenuItem(removeControlPointCxtMenuId);
                menus.hideMenuItem(removeAllControlPointCtxMenuId);
              }
              anchorPointUtilities.currentAnchorIndex = selectedIndex;
            }

          anchorPointUtilities.currentCtxEdge = edge;
        });

        cy.on('cyedgeediting.changeAnchorPoints', 'edge', function () {
          var edge = this;
          cy.startBatch();
          cy.edges().unselect();

          // Listener defined in other extension
          // Might have compatibility issues after the unbundled bezier    
          cy.trigger('bendPointMovement');

          cy.endBatch();
          refreshDraws();
        });
      }

      var selectedEdges;
      var anchorsMoving = false;

      // track arrow key presses, default false
      // event.keyCode normally returns number
      // but JS will convert to string anyway
      var keys = {
        '37': false,
        '38': false,
        '39': false,
        '40': false
      };

      function keyDown(e) {

        var shouldMove = typeof options().moveSelectedAnchorsOnKeyEvents === 'function' ? options().moveSelectedAnchorsOnKeyEvents() : options().moveSelectedAnchorsOnKeyEvents;

        if (!shouldMove) {
          return;
        }

        //Checks if the tagname is textarea or input
        var tn = document.activeElement.tagName;
        if (tn != "TEXTAREA" && tn != "INPUT") {
          switch (e.keyCode) {
            case 37:case 39:case 38:case 40: // Arrow keys
            case 32:
              e.preventDefault();break; // Space
            default:
              break; // do not block other keys
          }
          if (e.keyCode < '37' || e.keyCode > '40') {
            return;
          }
          keys[e.keyCode] = true;

          //Checks if only edges are selected (not any node) and if only 1 edge is selected
          //If the second checking is removed the anchors of multiple edges would move
          if (cy.edges(":selected").length != cy.elements(":selected").length || cy.edges(":selected").length != 1) {
            return;
          }
          if (!anchorsMoving) {
            selectedEdges = cy.edges(':selected');
            cy.trigger("edgeediting.movestart", [selectedEdges]);
            anchorsMoving = true;
          }
          var moveSpeed = 3;

          // doesn't make sense if alt and shift both pressed
          if (e.altKey && e.shiftKey) {
            return;
          } else if (e.altKey) {
            moveSpeed = 1;
          } else if (e.shiftKey) {
            moveSpeed = 10;
          }

          var upArrowCode = 38;
          var downArrowCode = 40;
          var leftArrowCode = 37;
          var rightArrowCode = 39;

          var dx = 0;
          var dy = 0;

          dx += keys[rightArrowCode] ? moveSpeed : 0;
          dx -= keys[leftArrowCode] ? moveSpeed : 0;
          dy += keys[downArrowCode] ? moveSpeed : 0;
          dy -= keys[upArrowCode] ? moveSpeed : 0;

          moveAnchorPoints({ x: dx, y: dy }, selectedEdges);
        }
      }
      function keyUp(e) {

        if (e.keyCode < '37' || e.keyCode > '40') {
          return;
        }
        e.preventDefault();
        keys[e.keyCode] = false;
        var shouldMove = typeof options().moveSelectedAnchorsOnKeyEvents === 'function' ? options().moveSelectedAnchorsOnKeyEvents() : options().moveSelectedAnchorsOnKeyEvents;

        if (!shouldMove) {
          return;
        }

        cy.trigger("edgeediting.moveend", [selectedEdges]);
        selectedEdges = undefined;
        anchorsMoving = false;
      }
      document.addEventListener("keydown", keyDown, true);
      document.addEventListener("keyup", keyUp, true);

      $container.data('cyedgeediting', data);
    },
    unbind: function unbind() {
      cy.off('remove', 'node', eRemove).off('add', 'node', eAdd).off('style', 'edge.edgebendediting-hasbendpoints:selected, edge.edgecontrolediting-hascontrolpoints:selected', eStyle).off('select', 'edge', eSelect).off('unselect', 'edge', eUnselect).off('tapstart', eTapStart).off('tapstart', 'edge', eTapStartOnEdge).off('tapdrag', eTapDrag).off('tapend', eTapEnd).off('cxttap', eCxtTap).off('drag', 'node', eDrag).off('data', 'edge', eData);

      cy.unbind("zoom pan", eZoom);
    }
  };

  if (functions[fn]) {
    return functions[fn].apply($(cy.container()), Array.prototype.slice.call(arguments, 1));
  } else if ((typeof fn === 'undefined' ? 'undefined' : _typeof(fn)) == 'object' || !fn) {
    return functions.init.apply($(cy.container()), arguments);
  } else {
    $.error('No such function `' + fn + '` for cytoscape.js-edge-editing');
  }

  return $(this);
};

/***/ }),

/***/ 259:
/***/ ((module) => {



var anchorPointUtilities = {
  options: undefined,
  currentCtxEdge: undefined,
  currentCtxPos: undefined,
  currentAnchorIndex: undefined,
  ignoredClasses: undefined,
  setIgnoredClasses: function setIgnoredClasses(_ignoredClasses) {
    this.ignoredClasses = _ignoredClasses;
  },
  syntax: {
    bend: {
      edge: "segments",
      class: "edgebendediting-hasbendpoints",
      multiClass: "edgebendediting-hasmultiplebendpoints",
      weight: "cyedgebendeditingWeights",
      distance: "cyedgebendeditingDistances",
      weightCss: "segment-weights",
      distanceCss: "segment-distances"
    },
    control: {
      edge: "unbundled-bezier",
      class: "edgecontrolediting-hascontrolpoints",
      multiClass: "edgecontrolediting-hasmultiplecontrolpoints",
      weight: "cyedgecontroleditingWeights",
      distance: "cyedgecontroleditingDistances",
      weightCss: "control-point-weights",
      distanceCss: "control-point-distances"
    }
  },
  // gets edge type as 'bend' or 'control'
  // the interchanging if-s are necessary to set the priority of the tags
  // example: an edge with type segment and a class 'hascontrolpoints' will be classified as unbundled bezier
  getEdgeType: function getEdgeType(edge) {
    if (!edge) return 'none';else if (edge.hasClass(this.syntax['bend']['class'])) return 'bend';else if (edge.hasClass(this.syntax['control']['class'])) return 'control';else if (edge.css('curve-style') === this.syntax['bend']['edge']) return 'bend';else if (edge.css('curve-style') === this.syntax['control']['edge']) return 'control';else if (this.options.bendPositionsFunction(edge) && this.options.bendPositionsFunction(edge).length > 0) return 'bend';else if (this.options.controlPositionsFunction(edge) && this.options.controlPositionsFunction(edge).length > 0) return 'control';
    return 'none';
  },
  // initilize anchor points based on bendPositionsFcn and controlPositionFcn
  initAnchorPoints: function initAnchorPoints(bendPositionsFcn, controlPositionsFcn, edges) {
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      var type = this.getEdgeType(edge);

      if (type === 'none') {
        continue;
      }

      if (!this.isIgnoredEdge(edge)) {

        var anchorPositions;

        // get the anchor positions by applying the functions for this edge
        if (type === 'bend') anchorPositions = bendPositionsFcn.apply(this, edge);else if (type === 'control') anchorPositions = controlPositionsFcn.apply(this, edge);

        var result = {
          weights: [],
          distances: []
        };

        if (anchorPositions) {
          result = this.convertToRelativePositions(edge, anchorPositions);
        } else {
          var weights = edge.data(this.syntax[type]['weight']);
          var distances = edge.data(this.syntax[type]['distance']);
          if (weights && distances) {
            result = {
              weights: weights,
              distances: distances
            };
          }
        }

        // if there are anchors set weights and distances accordingly and add class to enable style changes
        if (result.distances.length > 0) {
          edge.data(this.syntax[type]['weight'], result.weights);
          edge.data(this.syntax[type]['distance'], result.distances);
          edge.addClass(this.syntax[type]['class']);
          if (result.distances.length > 1) {
            edge.addClass(this.syntax[type]['multiClass']);
          }
        } else {
          edge.data(this.syntax[type]['weight'], []);
          edge.data(this.syntax[type]['distance'], []);
          if (edge.hasClass(this.syntax[type]['class'])) edge.removeClass(this.syntax[type]['class']);
          if (edge.hasClass(this.syntax[type]['multiClass'])) edge.removeClass(this.syntax[type]['multiClass']);
        }
      }
    }
  },

  isIgnoredEdge: function isIgnoredEdge(edge) {

    var startX = edge.source().position('x');
    var startY = edge.source().position('y');
    var endX = edge.target().position('x');
    var endY = edge.target().position('y');

    if (startX == endX && startY == endY || edge.source().id() == edge.target().id()) {
      return true;
    }
    for (var i = 0; this.ignoredClasses && i < this.ignoredClasses.length; i++) {
      if (edge.hasClass(this.ignoredClasses[i])) return true;
    }
    return false;
  },
  //Get the direction of the line from source point to the target point
  getLineDirection: function getLineDirection(srcPoint, tgtPoint) {
    if (srcPoint.y == tgtPoint.y && srcPoint.x < tgtPoint.x) {
      return 1;
    }
    if (srcPoint.y < tgtPoint.y && srcPoint.x < tgtPoint.x) {
      return 2;
    }
    if (srcPoint.y < tgtPoint.y && srcPoint.x == tgtPoint.x) {
      return 3;
    }
    if (srcPoint.y < tgtPoint.y && srcPoint.x > tgtPoint.x) {
      return 4;
    }
    if (srcPoint.y == tgtPoint.y && srcPoint.x > tgtPoint.x) {
      return 5;
    }
    if (srcPoint.y > tgtPoint.y && srcPoint.x > tgtPoint.x) {
      return 6;
    }
    if (srcPoint.y > tgtPoint.y && srcPoint.x == tgtPoint.x) {
      return 7;
    }
    return 8; //if srcPoint.y > tgtPoint.y and srcPoint.x < tgtPoint.x
  },
  getSrcTgtPointsAndTangents: function getSrcTgtPointsAndTangents(edge) {
    var sourceNode = edge.source();
    var targetNode = edge.target();

    var tgtPosition = targetNode.position();
    var srcPosition = sourceNode.position();

    var srcPoint = sourceNode.position();
    var tgtPoint = targetNode.position();

    var m1 = (tgtPoint.y - srcPoint.y) / (tgtPoint.x - srcPoint.x);
    var m2 = -1 / m1;

    return {
      m1: m1,
      m2: m2,
      srcPoint: srcPoint,
      tgtPoint: tgtPoint
    };
  },
  getIntersection: function getIntersection(edge, point, srcTgtPointsAndTangents) {
    if (srcTgtPointsAndTangents === undefined) {
      srcTgtPointsAndTangents = this.getSrcTgtPointsAndTangents(edge);
    }

    var srcPoint = srcTgtPointsAndTangents.srcPoint;
    var tgtPoint = srcTgtPointsAndTangents.tgtPoint;
    var m1 = srcTgtPointsAndTangents.m1;
    var m2 = srcTgtPointsAndTangents.m2;

    var intersectX;
    var intersectY;

    if (m1 == Infinity || m1 == -Infinity) {
      intersectX = srcPoint.x;
      intersectY = point.y;
    } else if (m1 == 0) {
      intersectX = point.x;
      intersectY = srcPoint.y;
    } else {
      var a1 = srcPoint.y - m1 * srcPoint.x;
      var a2 = point.y - m2 * point.x;

      intersectX = (a2 - a1) / (m1 - m2);
      intersectY = m1 * intersectX + a1;
    }

    //Intersection point is the intersection of the lines passing through the nodes and
    //passing through the bend or control point and perpendicular to the other line
    var intersectionPoint = {
      x: intersectX,
      y: intersectY
    };

    return intersectionPoint;
  },
  getAnchorsAsArray: function getAnchorsAsArray(edge) {
    var type = this.getEdgeType(edge);

    if (type === 'none') {
      return undefined;
    }

    if (edge.css('curve-style') !== this.syntax[type]['edge']) {
      return undefined;
    }

    var anchorList = [];

    var weights = edge.pstyle(this.syntax[type]['weightCss']) ? edge.pstyle(this.syntax[type]['weightCss']).pfValue : [];
    var distances = edge.pstyle(this.syntax[type]['distanceCss']) ? edge.pstyle(this.syntax[type]['distanceCss']).pfValue : [];
    var minLengths = Math.min(weights.length, distances.length);

    var srcPos = edge.source().position();
    var tgtPos = edge.target().position();

    var dy = tgtPos.y - srcPos.y;
    var dx = tgtPos.x - srcPos.x;

    var l = Math.sqrt(dx * dx + dy * dy);

    var vector = {
      x: dx,
      y: dy
    };

    var vectorNorm = {
      x: vector.x / l,
      y: vector.y / l
    };

    var vectorNormInverse = {
      x: -vectorNorm.y,
      y: vectorNorm.x
    };

    for (var s = 0; s < minLengths; s++) {
      var w = weights[s];
      var d = distances[s];

      var w1 = 1 - w;
      var w2 = w;

      var posPts = {
        x1: srcPos.x,
        x2: tgtPos.x,
        y1: srcPos.y,
        y2: tgtPos.y
      };

      var midptPts = posPts;

      var adjustedMidpt = {
        x: midptPts.x1 * w1 + midptPts.x2 * w2,
        y: midptPts.y1 * w1 + midptPts.y2 * w2
      };

      anchorList.push(adjustedMidpt.x + vectorNormInverse.x * d, adjustedMidpt.y + vectorNormInverse.y * d);
    }

    return anchorList;
  },
  convertToRelativePosition: function convertToRelativePosition(edge, point, srcTgtPointsAndTangents) {
    if (srcTgtPointsAndTangents === undefined) {
      srcTgtPointsAndTangents = this.getSrcTgtPointsAndTangents(edge);
    }

    var intersectionPoint = this.getIntersection(edge, point, srcTgtPointsAndTangents);
    var intersectX = intersectionPoint.x;
    var intersectY = intersectionPoint.y;

    var srcPoint = srcTgtPointsAndTangents.srcPoint;
    var tgtPoint = srcTgtPointsAndTangents.tgtPoint;

    var weight;

    if (intersectX != srcPoint.x) {
      weight = (intersectX - srcPoint.x) / (tgtPoint.x - srcPoint.x);
    } else if (intersectY != srcPoint.y) {
      weight = (intersectY - srcPoint.y) / (tgtPoint.y - srcPoint.y);
    } else {
      weight = 0;
    }

    var distance = Math.sqrt(Math.pow(intersectY - point.y, 2) + Math.pow(intersectX - point.x, 2));

    //Get the direction of the line form source point to target point
    var direction1 = this.getLineDirection(srcPoint, tgtPoint);
    //Get the direction of the line from intesection point to the point
    var direction2 = this.getLineDirection(intersectionPoint, point);

    //If the difference is not -2 and not 6 then the direction of the distance is negative
    if (direction1 - direction2 != -2 && direction1 - direction2 != 6) {
      if (distance != 0) distance = -1 * distance;
    }

    return {
      weight: weight,
      distance: distance
    };
  },
  convertToRelativePositions: function convertToRelativePositions(edge, anchorPoints) {
    var srcTgtPointsAndTangents = this.getSrcTgtPointsAndTangents(edge);

    var weights = [];
    var distances = [];

    for (var i = 0; anchorPoints && i < anchorPoints.length; i++) {
      var anchor = anchorPoints[i];
      var relativeAnchorPosition = this.convertToRelativePosition(edge, anchor, srcTgtPointsAndTangents);

      weights.push(relativeAnchorPosition.weight);
      distances.push(relativeAnchorPosition.distance);
    }

    return {
      weights: weights,
      distances: distances
    };
  },
  getDistancesString: function getDistancesString(edge, type) {
    var str = "";

    var distances = edge.data(this.syntax[type]['distance']);
    for (var i = 0; distances && i < distances.length; i++) {
      str = str + " " + distances[i];
    }

    return str;
  },
  getWeightsString: function getWeightsString(edge, type) {
    var str = "";

    var weights = edge.data(this.syntax[type]['weight']);
    for (var i = 0; weights && i < weights.length; i++) {
      str = str + " " + weights[i];
    }

    return str;
  },
  addAnchorPoint: function addAnchorPoint(edge, newAnchorPoint) {
    var type = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : undefined;

    if (edge === undefined || newAnchorPoint === undefined) {
      edge = this.currentCtxEdge;
      newAnchorPoint = this.currentCtxPos;
    }

    if (type === undefined) type = this.getEdgeType(edge);

    var weightStr = this.syntax[type]['weight'];
    var distanceStr = this.syntax[type]['distance'];

    var relativePosition = this.convertToRelativePosition(edge, newAnchorPoint);
    var originalAnchorWeight = relativePosition.weight;

    var startX = edge.source().position('x');
    var startY = edge.source().position('y');
    var endX = edge.target().position('x');
    var endY = edge.target().position('y');
    var startWeight = this.convertToRelativePosition(edge, { x: startX, y: startY }).weight;
    var endWeight = this.convertToRelativePosition(edge, { x: endX, y: endY }).weight;
    var weightsWithTgtSrc = [startWeight].concat(edge.data(weightStr) ? edge.data(weightStr) : []).concat([endWeight]);

    var anchorsList = this.getAnchorsAsArray(edge);

    var minDist = Infinity;
    var intersection;
    var ptsWithTgtSrc = [startX, startY].concat(anchorsList ? anchorsList : []).concat([endX, endY]);
    var newAnchorIndex = -1;

    for (var i = 0; i < weightsWithTgtSrc.length - 1; i++) {
      var w1 = weightsWithTgtSrc[i];
      var w2 = weightsWithTgtSrc[i + 1];

      //check if the weight is between w1 and w2
      var b1 = this.compareWithPrecision(originalAnchorWeight, w1, true);
      var b2 = this.compareWithPrecision(originalAnchorWeight, w2);
      var b3 = this.compareWithPrecision(originalAnchorWeight, w2, true);
      var b4 = this.compareWithPrecision(originalAnchorWeight, w1);
      if (b1 && b2 || b3 && b4) {
        var startX = ptsWithTgtSrc[2 * i];
        var startY = ptsWithTgtSrc[2 * i + 1];
        var endX = ptsWithTgtSrc[2 * i + 2];
        var endY = ptsWithTgtSrc[2 * i + 3];

        var start = {
          x: startX,
          y: startY
        };

        var end = {
          x: endX,
          y: endY
        };

        var m1 = (startY - endY) / (startX - endX);
        var m2 = -1 / m1;

        var srcTgtPointsAndTangents = {
          srcPoint: start,
          tgtPoint: end,
          m1: m1,
          m2: m2
        };

        var currentIntersection = this.getIntersection(edge, newAnchorPoint, srcTgtPointsAndTangents);
        var dist = Math.sqrt(Math.pow(newAnchorPoint.x - currentIntersection.x, 2) + Math.pow(newAnchorPoint.y - currentIntersection.y, 2));

        //Update the minimum distance
        if (dist < minDist) {
          minDist = dist;
          intersection = currentIntersection;
          newAnchorIndex = i;
        }
      }
    }

    if (intersection !== undefined) {
      newAnchorPoint = intersection;
    }

    relativePosition = this.convertToRelativePosition(edge, newAnchorPoint);

    if (intersection === undefined) {
      relativePosition.distance = 0;
    }

    var weights = edge.data(weightStr);
    var distances = edge.data(distanceStr);

    weights = weights ? weights : [];
    distances = distances ? distances : [];

    if (weights.length === 0) {
      newAnchorIndex = 0;
    }

    //    weights.push(relativeBendPosition.weight);
    //    distances.push(relativeBendPosition.distance);
    if (newAnchorIndex != -1) {
      weights.splice(newAnchorIndex, 0, relativePosition.weight);
      distances.splice(newAnchorIndex, 0, relativePosition.distance);
    }

    edge.data(weightStr, weights);
    edge.data(distanceStr, distances);

    edge.addClass(this.syntax[type]['class']);
    if (weights.length > 1 || distances.length > 1) {
      edge.addClass(this.syntax[type]['multiClass']);
    }

    return newAnchorIndex;
  },
  removeAnchor: function removeAnchor(edge, anchorIndex) {
    if (edge === undefined || anchorIndex === undefined) {
      edge = this.currentCtxEdge;
      anchorIndex = this.currentAnchorIndex;
    }

    var type = this.getEdgeType(edge);

    if (this.edgeTypeNoneShouldntHappen(type, "anchorPointUtilities.js, removeAnchor")) {
      return;
    }

    var distanceStr = this.syntax[type]['weight'];
    var weightStr = this.syntax[type]['distance'];

    var distances = edge.data(distanceStr);
    var weights = edge.data(weightStr);
    var positions;
    if (type === 'bend') {
      positions = this.options.bendPositionsFunction(edge);
    } else if (type === 'control') {
      positions = this.options.controlPositionsFunction(edge);
    }

    distances.splice(anchorIndex, 1);
    weights.splice(anchorIndex, 1);
    // position data is not given in demo so it throws error here
    // but it should be from the beginning
    if (positions) positions.splice(anchorIndex, 1);

    // only one anchor point left on edge
    if (distances.length == 1 || weights.length == 1) {
      edge.removeClass(this.syntax[type]['multiClass']);
    }
    // no more anchor points on edge
    else if (distances.length == 0 || weights.length == 0) {
        edge.removeClass(this.syntax[type]['class']);
        edge.data(distanceStr, []);
        edge.data(weightStr, []);
      } else {
        edge.data(distanceStr, distances);
        edge.data(weightStr, weights);
      }
  },
  removeAllAnchors: function removeAllAnchors(edge) {
    if (edge === undefined) {
      edge = this.currentCtxEdge;
    }
    var type = this.getEdgeType(edge);

    if (this.edgeTypeNoneShouldntHappen(type, "anchorPointUtilities.js, removeAllAnchors")) {
      return;
    }

    // Remove classes from edge
    edge.removeClass(this.syntax[type]['class']);
    edge.removeClass(this.syntax[type]['multiClass']);

    // Remove all anchor point data from edge
    var distanceStr = this.syntax[type]['weight'];
    var weightStr = this.syntax[type]['distance'];
    edge.data(distanceStr, []);
    edge.data(weightStr, []);
    // position data is not given in demo so it throws error here
    // but it should be from the beginning
    if (type === 'bend' && this.options.bendPositionsFunction(edge)) {
      this.options.bendPointPositionsSetterFunction(edge, []);
    } else if (type === 'control' && this.options.controlPositionsFunction(edge)) {
      this.options.controlPointPositionsSetterFunction(edge, []);
    }
  },
  calculateDistance: function calculateDistance(pt1, pt2) {
    var diffX = pt1.x - pt2.x;
    var diffY = pt1.y - pt2.y;

    var dist = Math.sqrt(Math.pow(diffX, 2) + Math.pow(diffY, 2));
    return dist;
  },
  /** (Less than or equal to) and (greater then equal to) comparisons with floating point numbers */
  compareWithPrecision: function compareWithPrecision(n1, n2) {
    var isLessThenOrEqual = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    var precision = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0.01;

    var diff = n1 - n2;
    if (Math.abs(diff) <= precision) {
      return true;
    }
    if (isLessThenOrEqual) {
      return n1 < n2;
    } else {
      return n1 > n2;
    }
  },
  edgeTypeNoneShouldntHappen: function edgeTypeNoneShouldntHappen(type, place) {
    if (type === 'none') {
      console.log("In " + place + ": edge type none should never happen here!!");
      return true;
    }
    return false;
  }
};

module.exports = anchorPointUtilities;

/***/ }),

/***/ 218:
/***/ ((module) => {



var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var debounce = function () {
  /**
   * lodash 3.1.1 (Custom Build) <https://lodash.com/>
   * Build: `lodash modern modularize exports="npm" -o ./`
   * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
   * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
   * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
   * Available under MIT license <https://lodash.com/license>
   */
  /** Used as the `TypeError` message for "Functions" methods. */
  var FUNC_ERROR_TEXT = 'Expected a function';

  /* Native method references for those with the same name as other `lodash` methods. */
  var nativeMax = Math.max,
      nativeNow = Date.now;

  /**
   * Gets the number of milliseconds that have elapsed since the Unix epoch
   * (1 January 1970 00:00:00 UTC).
   *
   * @static
   * @memberOf _
   * @category Date
   * @example
   *
   * _.defer(function(stamp) {
   *   console.log(_.now() - stamp);
   * }, _.now());
   * // => logs the number of milliseconds it took for the deferred function to be invoked
   */
  var now = nativeNow || function () {
    return new Date().getTime();
  };

  /**
   * Creates a debounced function that delays invoking `func` until after `wait`
   * milliseconds have elapsed since the last time the debounced function was
   * invoked. The debounced function comes with a `cancel` method to cancel
   * delayed invocations. Provide an options object to indicate that `func`
   * should be invoked on the leading and/or trailing edge of the `wait` timeout.
   * Subsequent calls to the debounced function return the result of the last
   * `func` invocation.
   *
   * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
   * on the trailing edge of the timeout only if the the debounced function is
   * invoked more than once during the `wait` timeout.
   *
   * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
   * for details over the differences between `_.debounce` and `_.throttle`.
   *
   * @static
   * @memberOf _
   * @category Function
   * @param {Function} func The function to debounce.
   * @param {number} [wait=0] The number of milliseconds to delay.
   * @param {Object} [options] The options object.
   * @param {boolean} [options.leading=false] Specify invoking on the leading
   *  edge of the timeout.
   * @param {number} [options.maxWait] The maximum time `func` is allowed to be
   *  delayed before it's invoked.
   * @param {boolean} [options.trailing=true] Specify invoking on the trailing
   *  edge of the timeout.
   * @returns {Function} Returns the new debounced function.
   * @example
   *
   * // avoid costly calculations while the window size is in flux
   * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
   *
   * // invoke `sendMail` when the click event is fired, debouncing subsequent calls
   * jQuery('#postbox').on('click', _.debounce(sendMail, 300, {
   *   'leading': true,
   *   'trailing': false
   * }));
   *
   * // ensure `batchLog` is invoked once after 1 second of debounced calls
   * var source = new EventSource('/stream');
   * jQuery(source).on('message', _.debounce(batchLog, 250, {
   *   'maxWait': 1000
   * }));
   *
   * // cancel a debounced call
   * var todoChanges = _.debounce(batchLog, 1000);
   * Object.observe(models.todo, todoChanges);
   *
   * Object.observe(models, function(changes) {
   *   if (_.find(changes, { 'user': 'todo', 'type': 'delete'})) {
   *     todoChanges.cancel();
   *   }
   * }, ['delete']);
   *
   * // ...at some point `models.todo` is changed
   * models.todo.completed = true;
   *
   * // ...before 1 second has passed `models.todo` is deleted
   * // which cancels the debounced `todoChanges` call
   * delete models.todo;
   */
  function debounce(func, wait, options) {
    var args,
        maxTimeoutId,
        result,
        stamp,
        thisArg,
        timeoutId,
        trailingCall,
        lastCalled = 0,
        maxWait = false,
        trailing = true;

    if (typeof func != 'function') {
      throw new TypeError(FUNC_ERROR_TEXT);
    }
    wait = wait < 0 ? 0 : +wait || 0;
    if (options === true) {
      var leading = true;
      trailing = false;
    } else if (isObject(options)) {
      leading = !!options.leading;
      maxWait = 'maxWait' in options && nativeMax(+options.maxWait || 0, wait);
      trailing = 'trailing' in options ? !!options.trailing : trailing;
    }

    function cancel() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
      }
      lastCalled = 0;
      maxTimeoutId = timeoutId = trailingCall = undefined;
    }

    function complete(isCalled, id) {
      if (id) {
        clearTimeout(id);
      }
      maxTimeoutId = timeoutId = trailingCall = undefined;
      if (isCalled) {
        lastCalled = now();
        result = func.apply(thisArg, args);
        if (!timeoutId && !maxTimeoutId) {
          args = thisArg = undefined;
        }
      }
    }

    function delayed() {
      var remaining = wait - (now() - stamp);
      if (remaining <= 0 || remaining > wait) {
        complete(trailingCall, maxTimeoutId);
      } else {
        timeoutId = setTimeout(delayed, remaining);
      }
    }

    function maxDelayed() {
      complete(trailing, timeoutId);
    }

    function debounced() {
      args = arguments;
      stamp = now();
      thisArg = this;
      trailingCall = trailing && (timeoutId || !leading);

      if (maxWait === false) {
        var leadingCall = leading && !timeoutId;
      } else {
        if (!maxTimeoutId && !leading) {
          lastCalled = stamp;
        }
        var remaining = maxWait - (stamp - lastCalled),
            isCalled = remaining <= 0 || remaining > maxWait;

        if (isCalled) {
          if (maxTimeoutId) {
            maxTimeoutId = clearTimeout(maxTimeoutId);
          }
          lastCalled = stamp;
          result = func.apply(thisArg, args);
        } else if (!maxTimeoutId) {
          maxTimeoutId = setTimeout(maxDelayed, remaining);
        }
      }
      if (isCalled && timeoutId) {
        timeoutId = clearTimeout(timeoutId);
      } else if (!timeoutId && wait !== maxWait) {
        timeoutId = setTimeout(delayed, wait);
      }
      if (leadingCall) {
        isCalled = true;
        result = func.apply(thisArg, args);
      }
      if (isCalled && !timeoutId && !maxTimeoutId) {
        args = thisArg = undefined;
      }
      return result;
    }

    debounced.cancel = cancel;
    return debounced;
  }

  /**
   * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
   * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(1);
   * // => false
   */
  function isObject(value) {
    // Avoid a V8 JIT bug in Chrome 19-20.
    // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
    var type = typeof value === 'undefined' ? 'undefined' : _typeof(value);
    return !!value && (type == 'object' || type == 'function');
  }

  return debounce;
}();

module.exports = debounce;

/***/ }),

/***/ 579:
/***/ ((module, exports, __webpack_require__) => {

var __WEBPACK_AMD_DEFINE_RESULT__;

;(function () {
  'use strict';

  var anchorPointUtilities = __webpack_require__(259);
  var debounce = __webpack_require__(218);

  // registers the extension on a cytoscape lib ref
  var register = function register(cytoscape, $, Konva) {
    var uiUtilities = __webpack_require__(347);

    if (!cytoscape || !$ || !Konva) {
      return;
    } // can't register if required libraries unspecified

    var defaults = {
      // A function parameter to get bend point positions, should return positions of bend points
      bendPositionsFunction: function bendPositionsFunction(ele) {
        return ele.data('bendPointPositions');
      },
      // A function parameter to get control point positions, should return positions of control points
      controlPositionsFunction: function controlPositionsFunction(ele) {
        return ele.data('controlPointPositions');
      },
      // A function parameter to set bend point positions
      bendPointPositionsSetterFunction: function bendPointPositionsSetterFunction(ele, bendPointPositions) {
        ele.data('bendPointPositions', bendPointPositions);
      },
      // A function parameter to set bend point positions
      controlPointPositionsSetterFunction: function controlPointPositionsSetterFunction(ele, controlPointPositions) {
        ele.data('controlPointPositions', controlPointPositions);
      },
      // whether to initilize bend and control points on creation of this extension automatically
      initAnchorsAutomatically: true,
      // the classes of those edges that should be ignored
      ignoredClasses: [],
      // whether the bend and control editing operations are undoable (requires cytoscape-undo-redo.js)
      undoable: false,
      // the size of bend and control point shape is obtained by multipling width of edge with this parameter
      anchorShapeSizeFactor: 3,
      // z-index value of the canvas in which bend and control points are drawn
      zIndex: 999,
      //An option that controls the distance within which a bend point is considered "near" the line segment between its two neighbors and will be automatically removed
      bendRemovalSensitivity: 8,
      // title of add bend point menu item (User may need to adjust width of menu items according to length of this option)
      addBendMenuItemTitle: "Add Bend Point",
      // title of remove bend point menu item (User may need to adjust width of menu items according to length of this option)
      removeBendMenuItemTitle: "Remove Bend Point",
      // title of remove all bend points menu item
      removeAllBendMenuItemTitle: "Remove All Bend Points",
      // title of add control point menu item (User may need to adjust width of menu items according to length of this option)
      addControlMenuItemTitle: "Add Control Point",
      // title of remove control point menu item (User may need to adjust width of menu items according to length of this option)
      removeControlMenuItemTitle: "Remove Control Point",
      // title of remove all control points menu item
      removeAllControlMenuItemTitle: "Remove All Control Points",
      // whether the bend and control points can be moved by arrows
      moveSelectedAnchorsOnKeyEvents: function moveSelectedAnchorsOnKeyEvents() {
        return true;
      },
      // whether 'Remove all bend points' and 'Remove all control points' options should be presented
      enableMultipleAnchorRemovalOption: false,
      // specifically for edge-editing menu items, whether trailing dividers should be used
      useTrailingDividersAfterContextMenuOptions: false,
      // Enable / disable drag creation of anchor points when there is at least one anchor already on the edge
      enableCreateAnchorOnDrag: true
    };

    var options;
    var initialized = false;

    // Merge default options with the ones coming from parameter
    function extend(defaults, options) {
      var obj = {};

      for (var i in defaults) {
        obj[i] = defaults[i];
      }

      for (var i in options) {
        // SPLIT FUNCTIONALITY?
        if (i == "bendRemovalSensitivity") {
          var value = options[i];
          if (!isNaN(value)) {
            if (value >= 0 && value <= 20) {
              obj[i] = options[i];
            } else if (value < 0) {
              obj[i] = 0;
            } else {
              obj[i] = 20;
            }
          }
        } else {
          obj[i] = options[i];
        }
      }

      return obj;
    };

    cytoscape('core', 'edgeEditing', function (opts) {
      var cy = this;

      if (opts === 'initialized') {
        return initialized;
      }

      if (opts !== 'get') {
        // merge the options with default ones
        options = extend(defaults, opts);
        initialized = true;

        // define edgebendediting-hasbendpoints css class
        cy.style().selector('.edgebendediting-hasbendpoints').css({
          'curve-style': 'segments',
          'segment-distances': function segmentDistances(ele) {
            return anchorPointUtilities.getDistancesString(ele, 'bend');
          },
          'segment-weights': function segmentWeights(ele) {
            return anchorPointUtilities.getWeightsString(ele, 'bend');
          },
          'edge-distances': 'node-position'
        });

        // define edgecontrolediting-hascontrolpoints css class
        cy.style().selector('.edgecontrolediting-hascontrolpoints').css({
          'curve-style': 'unbundled-bezier',
          'control-point-distances': function controlPointDistances(ele) {
            return anchorPointUtilities.getDistancesString(ele, 'control');
          },
          'control-point-weights': function controlPointWeights(ele) {
            return anchorPointUtilities.getWeightsString(ele, 'control');
          },
          'edge-distances': 'node-position'
        });

        cy.style().selector("#nwt_reconnectEdge_dummy").css({
          'width': '1',
          'height': '1',
          'visibility': 'hidden'
        });

        anchorPointUtilities.setIgnoredClasses(options.ignoredClasses);

        // init bend positions conditionally
        if (options.initAnchorsAutomatically) {
          // CHECK THIS, options.ignoredClasses UNUSED
          anchorPointUtilities.initAnchorPoints(options.bendPositionsFunction, options.controlPositionsFunction, cy.edges(), options.ignoredClasses);
        }

        uiUtilities(options, cy);
      }

      var instance = initialized ? {
        /*
        * get bend or control points of the given edge in an array A,
        * A[2 * i] is the x coordinate and A[2 * i + 1] is the y coordinate
        * of the ith bend point. (Returns undefined if the curve style is not segments nor unbundled bezier)
        */
        getAnchorsAsArray: function getAnchorsAsArray(ele) {
          return anchorPointUtilities.getAnchorsAsArray(ele);
        },
        // Initilize points for the given edges using 'options.bendPositionsFunction'
        initAnchorPoints: function initAnchorPoints(eles) {
          anchorPointUtilities.initAnchorPoints(options.bendPositionsFunction, options.controlPositionsFunction, eles);
        },
        deleteSelectedAnchor: function deleteSelectedAnchor(ele, index) {
          anchorPointUtilities.removeAnchor(ele, index);
        },
        getEdgeType: function getEdgeType(ele) {
          return anchorPointUtilities.getEdgeType(ele);
        }
      } : undefined;

      return instance; // chainability
    });
  };

  cytoscape('core', 'edgeEditingRefresh', function (opts) {
    var cy = this;

    // define edgebendediting-hasbendpoints css class
    cy.style().selector('.edgebendediting-hasbendpoints').css({
      'curve-style': 'segments',
      'segment-distances': function segmentDistances(ele) {
        return anchorPointUtilities.getDistancesString(ele, 'bend');
      },
      'segment-weights': function segmentWeights(ele) {
        return anchorPointUtilities.getWeightsString(ele, 'bend');
      },
      'edge-distances': 'node-position'
    });

    // define edgecontrolediting-hascontrolpoints css class
    cy.style().selector('.edgecontrolediting-hascontrolpoints').css({
      'curve-style': 'unbundled-bezier',
      'control-point-distances': function controlPointDistances(ele) {
        return anchorPointUtilities.getDistancesString(ele, 'control');
      },
      'control-point-weights': function controlPointWeights(ele) {
        return anchorPointUtilities.getWeightsString(ele, 'control');
      },
      'edge-distances': 'node-position'
    });

    cy.style().selector("#nwt_reconnectEdge_dummy").css({
      'width': '1',
      'height': '1',
      'visibility': 'hidden'
    });

    return instance; // chainability
  });

  if ( true && module.exports) {
    // expose as a commonjs module
    module.exports = register;
  }

  if (true) {
    // expose as an amd/requirejs module
    !(__WEBPACK_AMD_DEFINE_RESULT__ = (function () {
      return register;
    }).call(exports, __webpack_require__, exports, module),
		__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
  }

  if (typeof cytoscape !== 'undefined' && $ && Konva) {
    // expose to global cytoscape (i.e. window.cytoscape)
    register(cytoscape, $, Konva);
  }
})();

/***/ }),

/***/ 171:
/***/ ((module) => {



var reconnectionUtilities = {

    // creates and returns a dummy node which is connected to the disconnected edge
    disconnectEdge: function disconnectEdge(edge, cy, position, disconnectedEnd) {

        var dummyNode = {
            data: {
                id: 'nwt_reconnectEdge_dummy',
                ports: []
            },
            renderedPosition: position
        };
        cy.add(dummyNode);

        var loc = disconnectedEnd === 'source' ? { source: dummyNode.data.id } : { target: dummyNode.data.id };

        edge = edge.move(loc)[0];

        return {
            dummyNode: cy.nodes("#" + dummyNode.data.id)[0],
            edge: edge
        };
    },

    connectEdge: function connectEdge(edge, node, location) {
        if (!edge.isEdge() || !node.isNode()) return;

        var loc = {};
        if (location === 'source') loc.source = node.id();else if (location === 'target') loc.target = node.id();else return;

        return edge.move(loc)[0];
    },

    copyEdge: function copyEdge(oldEdge, newEdge) {
        this.copyAnchors(oldEdge, newEdge);
        this.copyStyle(oldEdge, newEdge);
    },

    copyStyle: function copyStyle(oldEdge, newEdge) {
        if (oldEdge && newEdge) {
            newEdge.data('line-color', oldEdge.data('line-color'));
            newEdge.data('width', oldEdge.data('width'));
            newEdge.data('cardinality', oldEdge.data('cardinality'));
        }
    },

    copyAnchors: function copyAnchors(oldEdge, newEdge) {
        if (oldEdge.hasClass('edgebendediting-hasbendpoints')) {
            var bpDistances = oldEdge.data('cyedgebendeditingDistances');
            var bpWeights = oldEdge.data('cyedgebendeditingWeights');

            newEdge.data('cyedgebendeditingDistances', bpDistances);
            newEdge.data('cyedgebendeditingWeights', bpWeights);
            newEdge.addClass('edgebendediting-hasbendpoints');
        } else if (oldEdge.hasClass('edgecontrolediting-hascontrolpoints')) {
            var bpDistances = oldEdge.data('cyedgecontroleditingDistances');
            var bpWeights = oldEdge.data('cyedgecontroleditingWeights');

            newEdge.data('cyedgecontroleditingDistances', bpDistances);
            newEdge.data('cyedgecontroleditingWeights', bpWeights);
            newEdge.addClass('edgecontrolediting-hascontrolpoints');
        }
        if (oldEdge.hasClass('edgebendediting-hasmultiplebendpoints')) {
            newEdge.addClass('edgebendediting-hasmultiplebendpoints');
        } else if (oldEdge.hasClass('edgecontrolediting-hasmultiplecontrolpoints')) {
            newEdge.addClass('edgecontrolediting-hasmultiplecontrolpoints');
        }
    }
};

module.exports = reconnectionUtilities;

/***/ }),

/***/ 961:
/***/ ((module) => {



module.exports = function (cy, anchorPointUtilities, params) {
  if (cy.undoRedo == null) return;

  var ur = cy.undoRedo({
    defaultActions: false,
    isDebug: true
  });

  function changeAnchorPoints(param) {
    var edge = cy.getElementById(param.edge.id());
    var type = param.type !== 'none' ? param.type : anchorPointUtilities.getEdgeType(edge);

    var weights, distances, weightStr, distanceStr;

    if (param.type === 'none' && !param.set) {
      weights = [];
      distances = [];
    } else {
      weightStr = anchorPointUtilities.syntax[type]['weight'];
      distanceStr = anchorPointUtilities.syntax[type]['distance'];

      weights = param.set ? edge.data(weightStr) : param.weights;
      distances = param.set ? edge.data(distanceStr) : param.distances;
    }

    var result = {
      edge: edge,
      type: type,
      weights: weights,
      distances: distances,
      //As the result will not be used for the first function call params should be used to set the data
      set: true
    };

    //Check if we need to set the weights and distances by the param values
    if (param.set) {

      var hadAnchorPoint = param.weights && param.weights.length > 0;
      var hadMultipleAnchorPoints = hadAnchorPoint && param.weights.length > 1;

      if (hadAnchorPoint) {
        edge.data(weightStr, param.weights);
        edge.data(distanceStr, param.distances);
      }

      var singleClassName = anchorPointUtilities.syntax[type]['class'];
      var multiClassName = anchorPointUtilities.syntax[type]['multiClass'];

      // Refresh the curve style as the number of anchor point would be changed by the previous operation
      // Adding or removing multi classes at once can cause errors. If multiple classes are to be added,
      // just add them together in space delimeted class names format.
      if (!hadAnchorPoint && !hadMultipleAnchorPoints) {
        // Remove multiple classes from edge with space delimeted string of class names 
        edge.removeClass(singleClassName + " " + multiClassName);
      } else if (hadAnchorPoint && !hadMultipleAnchorPoints) {
        // Had single anchor
        edge.addClass(singleClassName);
        edge.removeClass(multiClassName);
      } else {
        // Had multiple anchors. Add multiple classes with space delimeted string of class names
        edge.addClass(singleClassName + " " + multiClassName);
      }

      if (!hadAnchorPoint) {
        edge.data(weightStr, []);
        edge.data(distanceStr, []);
      }

      if (!edge.selected()) edge.select();else {
        edge.unselect();
        edge.select();
      }
    }

    edge.trigger('cyedgeediting.changeAnchorPoints');

    return result;
  }

  function moveDo(arg) {
    if (arg.firstTime) {
      delete arg.firstTime;
      return arg;
    }

    var edges = arg.edges;
    var positionDiff = arg.positionDiff;
    var result = {
      edges: edges,
      positionDiff: {
        x: -positionDiff.x,
        y: -positionDiff.y
      }
    };
    moveAnchorsUndoable(positionDiff, edges);

    return result;
  }

  function moveAnchorsUndoable(positionDiff, edges) {
    edges.forEach(function (edge) {
      var type = anchorPointUtilities.getEdgeType(edge);
      var previousAnchorsPosition = anchorPointUtilities.getAnchorsAsArray(edge);
      var nextAnchorsPosition = [];
      if (previousAnchorsPosition != undefined) {
        for (var i = 0; i < previousAnchorsPosition.length; i += 2) {
          nextAnchorsPosition.push({ x: previousAnchorsPosition[i] + positionDiff.x, y: previousAnchorsPosition[i + 1] + positionDiff.y });
        }
        if (type === 'bend') {
          params.bendPointPositionsSetterFunction(edge, nextAnchorsPosition);
        } else if (type === 'control') {
          params.controlPointPositionsSetterFunction(edge, nextAnchorsPosition);
        }
      }
    });

    anchorPointUtilities.initAnchorPoints(params.bendPositionsFunction, params.controlPositionsFunction, edges);
  }

  function reconnectEdge(param) {
    var edge = param.edge;
    var location = param.location;
    var oldLoc = param.oldLoc;

    edge = edge.move(location)[0];

    var result = {
      edge: edge,
      location: oldLoc,
      oldLoc: location
    };
    edge.unselect();
    return result;
  }

  function removeReconnectedEdge(param) {
    var oldEdge = param.oldEdge;
    var tmp = cy.getElementById(oldEdge.data('id'));
    if (tmp && tmp.length > 0) oldEdge = tmp;

    var newEdge = param.newEdge;
    var tmp = cy.getElementById(newEdge.data('id'));
    if (tmp && tmp.length > 0) newEdge = tmp;

    if (oldEdge.inside()) {
      oldEdge = oldEdge.remove()[0];
    }

    if (newEdge.removed()) {
      newEdge = newEdge.restore();
      newEdge.unselect();
    }

    return {
      oldEdge: newEdge,
      newEdge: oldEdge
    };
  }

  ur.action('changeAnchorPoints', changeAnchorPoints, changeAnchorPoints);
  ur.action('moveAnchorPoints', moveDo, moveDo);
  ur.action('reconnectEdge', reconnectEdge, reconnectEdge);
  ur.action('removeReconnectedEdge', removeReconnectedEdge, removeReconnectedEdge);
};

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(579);
/******/ 	
/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9jeXRvc2NhcGVFZGdlRWRpdGluZy93ZWJwYWNrL3VuaXZlcnNhbE1vZHVsZURlZmluaXRpb24iLCJ3ZWJwYWNrOi8vY3l0b3NjYXBlRWRnZUVkaXRpbmcvLi9zcmMvVUlVdGlsaXRpZXMuanMiLCJ3ZWJwYWNrOi8vY3l0b3NjYXBlRWRnZUVkaXRpbmcvLi9zcmMvYW5jaG9yUG9pbnRVdGlsaXRpZXMuanMiLCJ3ZWJwYWNrOi8vY3l0b3NjYXBlRWRnZUVkaXRpbmcvLi9zcmMvZGVib3VuY2UuanMiLCJ3ZWJwYWNrOi8vY3l0b3NjYXBlRWRnZUVkaXRpbmcvLi9zcmMvaW5kZXguanMiLCJ3ZWJwYWNrOi8vY3l0b3NjYXBlRWRnZUVkaXRpbmcvLi9zcmMvcmVjb25uZWN0aW9uVXRpbGl0aWVzLmpzIiwid2VicGFjazovL2N5dG9zY2FwZUVkZ2VFZGl0aW5nLy4vc3JjL3JlZ2lzdGVyVW5kb1JlZG9GdW5jdGlvbnMuanMiLCJ3ZWJwYWNrOi8vY3l0b3NjYXBlRWRnZUVkaXRpbmcvd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vY3l0b3NjYXBlRWRnZUVkaXRpbmcvd2VicGFjay9zdGFydHVwIl0sIm5hbWVzIjpbImRlYm91bmNlIiwicmVxdWlyZSIsImFuY2hvclBvaW50VXRpbGl0aWVzIiwicmVjb25uZWN0aW9uVXRpbGl0aWVzIiwicmVnaXN0ZXJVbmRvUmVkb0Z1bmN0aW9ucyIsInN0YWdlSWQiLCJtb2R1bGUiLCJleHBvcnRzIiwicGFyYW1zIiwiY3kiLCJmbiIsIm9wdGlvbnMiLCJhZGRCZW5kUG9pbnRDeHRNZW51SWQiLCJyZW1vdmVCZW5kUG9pbnRDeHRNZW51SWQiLCJyZW1vdmVBbGxCZW5kUG9pbnRDdHhNZW51SWQiLCJhZGRDb250cm9sUG9pbnRDeHRNZW51SWQiLCJyZW1vdmVDb250cm9sUG9pbnRDeHRNZW51SWQiLCJyZW1vdmVBbGxDb250cm9sUG9pbnRDdHhNZW51SWQiLCJlU3R5bGUiLCJlUmVtb3ZlIiwiZUFkZCIsImVab29tIiwiZVNlbGVjdCIsImVVbnNlbGVjdCIsImVUYXBTdGFydCIsImVUYXBTdGFydE9uRWRnZSIsImVUYXBEcmFnIiwiZVRhcEVuZCIsImVDeHRUYXAiLCJlRHJhZyIsImVEYXRhIiwibGFzdFBhbm5pbmdFbmFibGVkIiwibGFzdFpvb21pbmdFbmFibGVkIiwibGFzdEJveFNlbGVjdGlvbkVuYWJsZWQiLCJsYXN0QWN0aXZlQmdPcGFjaXR5IiwiZWRnZVRvSGlnaGxpZ2h0IiwibnVtYmVyT2ZTZWxlY3RlZEVkZ2VzIiwiZW5kcG9pbnRTaGFwZTEiLCJlbmRwb2ludFNoYXBlMiIsImFuY2hvclRvdWNoZWQiLCJtb3VzZU91dCIsImZ1bmN0aW9ucyIsImluaXQiLCJzZWxmIiwib3B0cyIsIiRjb250YWluZXIiLCIkIiwiY2FudmFzRWxlbWVudElkIiwiJGNhbnZhc0VsZW1lbnQiLCJmaW5kIiwibGVuZ3RoIiwiYXBwZW5kIiwic3RhZ2UiLCJLb252YSIsInN0YWdlcyIsIlN0YWdlIiwiaWQiLCJjb250YWluZXIiLCJ3aWR0aCIsImhlaWdodCIsImNhbnZhcyIsImdldENoaWxkcmVuIiwiTGF5ZXIiLCJhZGQiLCJhbmNob3JNYW5hZ2VyIiwiZWRnZSIsInVuZGVmaW5lZCIsImVkZ2VUeXBlIiwiYW5jaG9ycyIsInRvdWNoZWRBbmNob3IiLCJ0b3VjaGVkQW5jaG9ySW5kZXgiLCJiaW5kTGlzdGVuZXJzIiwiYW5jaG9yIiwib24iLCJlTW91c2VEb3duIiwidW5iaW5kTGlzdGVuZXJzIiwib2ZmIiwiZXZlbnQiLCJhdXRvdW5zZWxlY3RpZnkiLCJ0YXJnZXQiLCJ1bnNlbGVjdCIsIndlaWdodFN0ciIsInN5bnRheCIsImRpc3RhbmNlU3RyIiwibW92ZUFuY2hvclBhcmFtIiwidHlwZSIsIndlaWdodHMiLCJkYXRhIiwiY29uY2F0IiwiZGlzdGFuY2VzIiwidHVybk9mZkFjdGl2ZUJnQ29sb3IiLCJkaXNhYmxlR2VzdHVyZXMiLCJhdXRvdW5ncmFiaWZ5IiwiZ2V0U3RhZ2UiLCJlTW91c2VVcCIsImVNb3VzZU91dCIsInNlbGVjdCIsInJlc2V0QWN0aXZlQmdDb2xvciIsInJlc2V0R2VzdHVyZXMiLCJjbGVhckFuY2hvcnNFeGNlcHQiLCJkb250Q2xlYW4iLCJleGNlcHRpb25BcHBsaWVzIiwiZm9yRWFjaCIsImluZGV4IiwiZGVzdHJveSIsInJlbmRlckFuY2hvclNoYXBlcyIsImdldEVkZ2VUeXBlIiwiaGFzQ2xhc3MiLCJhbmNob3JMaXN0IiwiZ2V0QW5jaG9yc0FzQXJyYXkiLCJnZXRBbmNob3JTaGFwZXNMZW5ndGgiLCJzcmNQb3MiLCJzb3VyY2UiLCJwb3NpdGlvbiIsInRndFBvcyIsImkiLCJhbmNob3JYIiwiYW5jaG9yWSIsInJlbmRlckFuY2hvclNoYXBlIiwiZHJhdyIsInRvcExlZnRYIiwidG9wTGVmdFkiLCJyZW5kZXJlZFRvcExlZnRQb3MiLCJjb252ZXJ0VG9SZW5kZXJlZFBvc2l0aW9uIiwieCIsInkiLCJ6b29tIiwibmV3QW5jaG9yIiwiUmVjdCIsImZpbGwiLCJzdHJva2VXaWR0aCIsImRyYWdnYWJsZSIsInB1c2giLCJjeHRBZGRCZW5kRmNuIiwiY3h0QWRkQW5jaG9yRmNuIiwiY3h0QWRkQ29udHJvbEZjbiIsImFuY2hvclR5cGUiLCJjeVRhcmdldCIsImlzSWdub3JlZEVkZ2UiLCJwYXJhbSIsImFkZEFuY2hvclBvaW50IiwidW5kb2FibGUiLCJ1bmRvUmVkbyIsImRvIiwicmVmcmVzaERyYXdzIiwiY3h0UmVtb3ZlQW5jaG9yRmNuIiwiZWRnZVR5cGVOb25lU2hvdWxkbnRIYXBwZW4iLCJyZW1vdmVBbmNob3IiLCJzZXRUaW1lb3V0IiwiY3h0UmVtb3ZlQWxsQW5jaG9yc0ZjbiIsInJlbW92ZUFsbEFuY2hvcnMiLCJoYW5kbGVSZWNvbm5lY3RFZGdlIiwidmFsaWRhdGVFZGdlIiwiYWN0T25VbnN1Y2Nlc3NmdWxSZWNvbm5lY3Rpb24iLCJtZW51SXRlbXMiLCJjb250ZW50IiwiYWRkQmVuZE1lbnVJdGVtVGl0bGUiLCJzZWxlY3RvciIsIm9uQ2xpY2tGdW5jdGlvbiIsImhhc1RyYWlsaW5nRGl2aWRlciIsInVzZVRyYWlsaW5nRGl2aWRlcnNBZnRlckNvbnRleHRNZW51T3B0aW9ucyIsInJlbW92ZUJlbmRNZW51SXRlbVRpdGxlIiwicmVtb3ZlQWxsQmVuZE1lbnVJdGVtVGl0bGUiLCJlbmFibGVNdWx0aXBsZUFuY2hvclJlbW92YWxPcHRpb24iLCJhZGRDb250cm9sTWVudUl0ZW1UaXRsZSIsImNvcmVBc1dlbGwiLCJyZW1vdmVDb250cm9sTWVudUl0ZW1UaXRsZSIsInJlbW92ZUFsbENvbnRyb2xNZW51SXRlbVRpdGxlIiwiY29udGV4dE1lbnVzIiwibWVudXMiLCJpc0FjdGl2ZSIsImFwcGVuZE1lbnVJdGVtcyIsIl9zaXplQ2FudmFzIiwiYXR0ciIsImNzcyIsInpJbmRleCIsImNhbnZhc0JiIiwib2Zmc2V0IiwiY29udGFpbmVyQmIiLCJ0b3AiLCJsZWZ0Iiwic2V0V2lkdGgiLCJzZXRIZWlnaHQiLCJzaXplQ2FudmFzIiwid2luZG93IiwiYmluZCIsIm9wdENhY2hlIiwibW9kZWxQb3NpdGlvbiIsInBhbiIsInJlbmRlckVuZFBvaW50U2hhcGVzIiwiZWRnZV9wdHMiLCJzb3VyY2VQb3MiLCJzb3VyY2VFbmRwb2ludCIsInRhcmdldFBvcyIsInRhcmdldEVuZHBvaW50IiwidW5zaGlmdCIsInNyYyIsIm5leHRUb1NvdXJjZSIsIm5leHRUb1RhcmdldCIsInJlbmRlckVhY2hFbmRQb2ludFNoYXBlIiwic1RvcExlZnRYIiwic1RvcExlZnRZIiwidFRvcExlZnRYIiwidFRvcExlZnRZIiwibmV4dFRvU291cmNlWCIsIm5leHRUb1NvdXJjZVkiLCJuZXh0VG9UYXJnZXRYIiwibmV4dFRvVGFyZ2V0WSIsInJlbmRlcmVkU291cmNlUG9zIiwicmVuZGVyZWRUYXJnZXRQb3MiLCJyZW5kZXJlZE5leHRUb1NvdXJjZSIsInJlbmRlcmVkTmV4dFRvVGFyZ2V0IiwiZGlzdGFuY2VGcm9tTm9kZSIsImRpc3RhbmNlU291cmNlIiwiTWF0aCIsInNxcnQiLCJwb3ciLCJzb3VyY2VFbmRQb2ludFgiLCJzb3VyY2VFbmRQb2ludFkiLCJkaXN0YW5jZVRhcmdldCIsInRhcmdldEVuZFBvaW50WCIsInRhcmdldEVuZFBvaW50WSIsIkNpcmNsZSIsInJhZGl1cyIsImZhY3RvciIsImFuY2hvclNoYXBlU2l6ZUZhY3RvciIsInBhcnNlRmxvYXQiLCJjaGVja0lmSW5zaWRlU2hhcGUiLCJjZW50ZXJYIiwiY2VudGVyWSIsIm1pblgiLCJtYXhYIiwibWluWSIsIm1heFkiLCJpbnNpZGUiLCJnZXRDb250YWluaW5nU2hhcGVJbmRleCIsImdldENvbnRhaW5pbmdFbmRQb2ludCIsImFsbFB0cyIsIl9wcml2YXRlIiwicnNjcmF0Y2giLCJhbGxwdHMiLCJwYW5uaW5nRW5hYmxlZCIsInpvb21pbmdFbmFibGVkIiwiYm94U2VsZWN0aW9uRW5hYmxlZCIsInN0eWxlIiwiY29yZVN0eWxlIiwidmFsdWUiLCJ1cGRhdGUiLCJtb3ZlQW5jaG9yUG9pbnRzIiwicG9zaXRpb25EaWZmIiwiZWRnZXMiLCJwcmV2aW91c0FuY2hvcnNQb3NpdGlvbiIsIm5leHRBbmNob3JQb2ludHNQb3NpdGlvbiIsImJlbmRQb2ludFBvc2l0aW9uc1NldHRlckZ1bmN0aW9uIiwiY29udHJvbFBvaW50UG9zaXRpb25zU2V0dGVyRnVuY3Rpb24iLCJpbml0QW5jaG9yUG9pbnRzIiwiYmVuZFBvc2l0aW9uc0Z1bmN0aW9uIiwiY29udHJvbFBvc2l0aW9uc0Z1bmN0aW9uIiwidHJpZ2dlciIsIm1vdmVBbmNob3JPbkRyYWciLCJyZWxhdGl2ZUFuY2hvclBvc2l0aW9uIiwiY29udmVydFRvUmVsYXRpdmVQb3NpdGlvbiIsIndlaWdodCIsImRpc3RhbmNlIiwiX21vdmVBbmNob3JPbkRyYWciLCJzZWxlY3RlZEVkZ2VzIiwic2VsZWN0ZWQiLCJzdGFydEJhdGNoIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyIsImVuZEJhdGNoIiwiY29ubmVjdGVkRWRnZXMiLCJtb3ZlZEFuY2hvckluZGV4IiwidGFwU3RhcnRQb3MiLCJtb3ZlZEVkZ2UiLCJjcmVhdGVBbmNob3JPbkRyYWciLCJtb3ZlZEVuZFBvaW50IiwiZHVtbXlOb2RlIiwiZGV0YWNoZWROb2RlIiwibm9kZVRvQXR0YWNoIiwiYW5jaG9yQ3JlYXRlZEJ5RHJhZyIsImN5UG9zaXRpb24iLCJjeVBvc1giLCJjeVBvc1kiLCJlbmRQb2ludCIsImRpc2Nvbm5lY3RlZEVuZCIsInJlc3VsdCIsImRpc2Nvbm5lY3RFZGdlIiwicmVuZGVyZWRQb3NpdGlvbiIsImVuYWJsZUNyZWF0ZUFuY2hvck9uRHJhZyIsImV2ZW50UG9zIiwiaXNOb2RlIiwiZmlyZSIsInN0YXJ0WCIsInN0YXJ0WSIsImVuZFgiLCJlbmRZIiwiYWxsQW5jaG9ycyIsImFuY2hvckluZGV4IiwicHJlSW5kZXgiLCJwb3NJbmRleCIsInByZUFuY2hvclBvaW50IiwicG9zQW5jaG9yUG9pbnQiLCJuZWFyVG9MaW5lIiwibTEiLCJtMiIsInNyY1RndFBvaW50c0FuZFRhbmdlbnRzIiwic3JjUG9pbnQiLCJ0Z3RQb2ludCIsImN1cnJlbnRJbnRlcnNlY3Rpb24iLCJnZXRJbnRlcnNlY3Rpb24iLCJkaXN0IiwiYmVuZFJlbW92YWxTZW5zaXRpdml0eSIsIm5ld05vZGUiLCJpc1ZhbGlkIiwibG9jYXRpb24iLCJuZXdTb3VyY2UiLCJuZXdUYXJnZXQiLCJjb25uZWN0RWRnZSIsInJlY29ubmVjdGVkRWRnZSIsImNvcHlFZGdlIiwibmV3RWRnZSIsIm9sZEVkZ2UiLCJyZW1vdmUiLCJsb2MiLCJvbGRMb2MiLCJ0b1N0cmluZyIsIm1vdmVhbmNob3JwYXJhbSIsImZpcnN0QW5jaG9yIiwiZWRnZUNvbnRhaW5pbmdGaXJzdEFuY2hvciIsImZpcnN0QW5jaG9yUG9pbnRGb3VuZCIsImUiLCJmaXJzdFRpbWUiLCJmaXJzdEFuY2hvclBvc2l0aW9uIiwiaW5pdGlhbFBvcyIsIm1vdmVkRmlyc3RBbmNob3IiLCJ0YXJnZXRJc0VkZ2UiLCJpc0VkZ2UiLCJlcnIiLCJoaWRlTWVudUl0ZW0iLCJjeVBvcyIsInNlbGVjdGVkSW5kZXgiLCJzaG93TWVudUl0ZW0iLCJjdXJyZW50Q3R4UG9zIiwiY3VycmVudEFuY2hvckluZGV4IiwiY3VycmVudEN0eEVkZ2UiLCJhbmNob3JzTW92aW5nIiwia2V5cyIsImtleURvd24iLCJzaG91bGRNb3ZlIiwibW92ZVNlbGVjdGVkQW5jaG9yc09uS2V5RXZlbnRzIiwidG4iLCJkb2N1bWVudCIsImFjdGl2ZUVsZW1lbnQiLCJ0YWdOYW1lIiwia2V5Q29kZSIsInByZXZlbnREZWZhdWx0IiwiZWxlbWVudHMiLCJtb3ZlU3BlZWQiLCJhbHRLZXkiLCJzaGlmdEtleSIsInVwQXJyb3dDb2RlIiwiZG93bkFycm93Q29kZSIsImxlZnRBcnJvd0NvZGUiLCJyaWdodEFycm93Q29kZSIsImR4IiwiZHkiLCJrZXlVcCIsImFkZEV2ZW50TGlzdGVuZXIiLCJ1bmJpbmQiLCJhcHBseSIsIkFycmF5IiwicHJvdG90eXBlIiwic2xpY2UiLCJjYWxsIiwiYXJndW1lbnRzIiwiZXJyb3IiLCJpZ25vcmVkQ2xhc3NlcyIsInNldElnbm9yZWRDbGFzc2VzIiwiX2lnbm9yZWRDbGFzc2VzIiwiYmVuZCIsImNsYXNzIiwibXVsdGlDbGFzcyIsIndlaWdodENzcyIsImRpc3RhbmNlQ3NzIiwiY29udHJvbCIsImJlbmRQb3NpdGlvbnNGY24iLCJjb250cm9sUG9zaXRpb25zRmNuIiwiYW5jaG9yUG9zaXRpb25zIiwiY29udmVydFRvUmVsYXRpdmVQb3NpdGlvbnMiLCJnZXRMaW5lRGlyZWN0aW9uIiwiZ2V0U3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMiLCJzb3VyY2VOb2RlIiwidGFyZ2V0Tm9kZSIsInRndFBvc2l0aW9uIiwic3JjUG9zaXRpb24iLCJwb2ludCIsImludGVyc2VjdFgiLCJpbnRlcnNlY3RZIiwiSW5maW5pdHkiLCJhMSIsImEyIiwiaW50ZXJzZWN0aW9uUG9pbnQiLCJwc3R5bGUiLCJwZlZhbHVlIiwibWluTGVuZ3RocyIsIm1pbiIsImwiLCJ2ZWN0b3IiLCJ2ZWN0b3JOb3JtIiwidmVjdG9yTm9ybUludmVyc2UiLCJzIiwidyIsImQiLCJ3MSIsIncyIiwicG9zUHRzIiwieDEiLCJ4MiIsInkxIiwieTIiLCJtaWRwdFB0cyIsImFkanVzdGVkTWlkcHQiLCJkaXJlY3Rpb24xIiwiZGlyZWN0aW9uMiIsImFuY2hvclBvaW50cyIsImdldERpc3RhbmNlc1N0cmluZyIsInN0ciIsImdldFdlaWdodHNTdHJpbmciLCJuZXdBbmNob3JQb2ludCIsInJlbGF0aXZlUG9zaXRpb24iLCJvcmlnaW5hbEFuY2hvcldlaWdodCIsInN0YXJ0V2VpZ2h0IiwiZW5kV2VpZ2h0Iiwid2VpZ2h0c1dpdGhUZ3RTcmMiLCJhbmNob3JzTGlzdCIsIm1pbkRpc3QiLCJpbnRlcnNlY3Rpb24iLCJwdHNXaXRoVGd0U3JjIiwibmV3QW5jaG9ySW5kZXgiLCJiMSIsImNvbXBhcmVXaXRoUHJlY2lzaW9uIiwiYjIiLCJiMyIsImI0Iiwic3RhcnQiLCJlbmQiLCJzcGxpY2UiLCJwb3NpdGlvbnMiLCJjYWxjdWxhdGVEaXN0YW5jZSIsInB0MSIsInB0MiIsImRpZmZYIiwiZGlmZlkiLCJuMSIsIm4yIiwiaXNMZXNzVGhlbk9yRXF1YWwiLCJwcmVjaXNpb24iLCJkaWZmIiwiYWJzIiwicGxhY2UiLCJjb25zb2xlIiwibG9nIiwiRlVOQ19FUlJPUl9URVhUIiwibmF0aXZlTWF4IiwibWF4IiwibmF0aXZlTm93IiwiRGF0ZSIsIm5vdyIsImdldFRpbWUiLCJmdW5jIiwid2FpdCIsImFyZ3MiLCJtYXhUaW1lb3V0SWQiLCJzdGFtcCIsInRoaXNBcmciLCJ0aW1lb3V0SWQiLCJ0cmFpbGluZ0NhbGwiLCJsYXN0Q2FsbGVkIiwibWF4V2FpdCIsInRyYWlsaW5nIiwiVHlwZUVycm9yIiwibGVhZGluZyIsImlzT2JqZWN0IiwiY2FuY2VsIiwiY2xlYXJUaW1lb3V0IiwiY29tcGxldGUiLCJpc0NhbGxlZCIsImRlbGF5ZWQiLCJyZW1haW5pbmciLCJtYXhEZWxheWVkIiwiZGVib3VuY2VkIiwibGVhZGluZ0NhbGwiLCJyZWdpc3RlciIsImN5dG9zY2FwZSIsInVpVXRpbGl0aWVzIiwiZGVmYXVsdHMiLCJlbGUiLCJiZW5kUG9pbnRQb3NpdGlvbnMiLCJjb250cm9sUG9pbnRQb3NpdGlvbnMiLCJpbml0QW5jaG9yc0F1dG9tYXRpY2FsbHkiLCJpbml0aWFsaXplZCIsImV4dGVuZCIsIm9iaiIsImlzTmFOIiwiaW5zdGFuY2UiLCJlbGVzIiwiZGVsZXRlU2VsZWN0ZWRBbmNob3IiLCJkZWZpbmUiLCJwb3J0cyIsIm1vdmUiLCJub2RlcyIsIm5vZGUiLCJjb3B5QW5jaG9ycyIsImNvcHlTdHlsZSIsImJwRGlzdGFuY2VzIiwiYnBXZWlnaHRzIiwidXIiLCJkZWZhdWx0QWN0aW9ucyIsImlzRGVidWciLCJjaGFuZ2VBbmNob3JQb2ludHMiLCJnZXRFbGVtZW50QnlJZCIsInNldCIsImhhZEFuY2hvclBvaW50IiwiaGFkTXVsdGlwbGVBbmNob3JQb2ludHMiLCJzaW5nbGVDbGFzc05hbWUiLCJtdWx0aUNsYXNzTmFtZSIsIm1vdmVEbyIsImFyZyIsIm1vdmVBbmNob3JzVW5kb2FibGUiLCJuZXh0QW5jaG9yc1Bvc2l0aW9uIiwicmVjb25uZWN0RWRnZSIsInJlbW92ZVJlY29ubmVjdGVkRWRnZSIsInRtcCIsInJlbW92ZWQiLCJyZXN0b3JlIiwiYWN0aW9uIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDO0FBQ0QsTzs7Ozs7Ozs7Ozs7QUNWQSxJQUFJQSxXQUFXQyxtQkFBT0EsQ0FBQyxHQUFSLENBQWY7QUFDQSxJQUFJQyx1QkFBdUJELG1CQUFPQSxDQUFDLEdBQVIsQ0FBM0I7QUFDQSxJQUFJRSx3QkFBd0JGLG1CQUFPQSxDQUFDLEdBQVIsQ0FBNUI7QUFDQSxJQUFJRyw0QkFBNEJILG1CQUFPQSxDQUFDLEdBQVIsQ0FBaEM7QUFDQSxJQUFJSSxVQUFVLENBQWQ7O0FBRUFDLE9BQU9DLE9BQVAsR0FBaUIsVUFBVUMsTUFBVixFQUFrQkMsRUFBbEIsRUFBc0I7QUFDckMsTUFBSUMsS0FBS0YsTUFBVDs7QUFFQU4sdUJBQXFCUyxPQUFyQixHQUErQkgsTUFBL0I7O0FBRUEsTUFBSUksd0JBQXdCLDRDQUE0Q1AsT0FBeEU7QUFDQSxNQUFJUSwyQkFBMkIsK0NBQStDUixPQUE5RTtBQUNBLE1BQUlTLDhCQUE4Qix3REFBd0RULE9BQTFGO0FBQ0EsTUFBSVUsMkJBQTJCLGtEQUFrRFYsT0FBakY7QUFDQSxNQUFJVyw4QkFBOEIscURBQXFEWCxPQUF2RjtBQUNBLE1BQUlZLGlDQUFpQywyREFBMkRaLE9BQWhHO0FBQ0EsTUFBSWEsTUFBSixFQUFZQyxPQUFaLEVBQXFCQyxJQUFyQixFQUEyQkMsS0FBM0IsRUFBa0NDLE9BQWxDLEVBQTJDQyxTQUEzQyxFQUFzREMsU0FBdEQsRUFBaUVDLGVBQWpFLEVBQWtGQyxRQUFsRixFQUE0RkMsT0FBNUYsRUFBcUdDLE9BQXJHLEVBQThHQyxLQUE5RyxFQUFxSEMsS0FBckg7QUFDQTtBQUNBLE1BQUlDLGtCQUFKLEVBQXdCQyxrQkFBeEIsRUFBNENDLHVCQUE1QztBQUNBLE1BQUlDLG1CQUFKO0FBQ0E7QUFDQSxNQUFJQyxlQUFKLEVBQXFCQyxxQkFBckI7O0FBRUE7QUFDQSxNQUFJQyxpQkFBaUIsSUFBckI7QUFBQSxNQUEyQkMsaUJBQWlCLElBQTVDO0FBQ0E7QUFDQSxNQUFJQyxnQkFBZ0IsS0FBcEI7QUFDQTtBQUNBLE1BQUlDLFFBQUo7O0FBRUEsTUFBSUMsWUFBWTtBQUNkQyxVQUFNLGdCQUFZO0FBQ2hCO0FBQ0F0QyxnQ0FBMEJLLEVBQTFCLEVBQThCUCxvQkFBOUIsRUFBb0RNLE1BQXBEOztBQUVBLFVBQUltQyxPQUFPLElBQVg7QUFDQSxVQUFJQyxPQUFPcEMsTUFBWDs7QUFFQTs7Ozs7OztBQU9BLFVBQUlxQyxhQUFhQyxFQUFFLElBQUYsQ0FBakI7QUFDQSxVQUFJQyxrQkFBa0IsK0JBQStCMUMsT0FBckQ7QUFDQUE7QUFDQSxVQUFJMkMsaUJBQWlCRixFQUFFLGNBQWNDLGVBQWQsR0FBZ0MsVUFBbEMsQ0FBckI7O0FBRUEsVUFBSUYsV0FBV0ksSUFBWCxDQUFnQixNQUFNRixlQUF0QixFQUF1Q0csTUFBdkMsR0FBZ0QsQ0FBcEQsRUFBdUQ7QUFDckRMLG1CQUFXTSxNQUFYLENBQWtCSCxjQUFsQjtBQUNEOztBQUVEOzs7Ozs7OztBQVFBLFVBQUlJLEtBQUo7QUFDQSxVQUFJQyxNQUFNQyxNQUFOLENBQWFKLE1BQWIsR0FBc0I3QyxPQUExQixFQUFtQztBQUNqQytDLGdCQUFRLElBQUlDLE1BQU1FLEtBQVYsQ0FBZ0I7QUFDdEJDLGNBQUkseUJBRGtCO0FBRXRCQyxxQkFBV1YsZUFGVyxFQUVRO0FBQzlCVyxpQkFBT2IsV0FBV2EsS0FBWCxFQUhlO0FBSXRCQyxrQkFBUWQsV0FBV2MsTUFBWDtBQUpjLFNBQWhCLENBQVI7QUFNRCxPQVBELE1BUUs7QUFDSFAsZ0JBQVFDLE1BQU1DLE1BQU4sQ0FBYWpELFVBQVUsQ0FBdkIsQ0FBUjtBQUNEOztBQUVELFVBQUl1RCxNQUFKO0FBQ0EsVUFBSVIsTUFBTVMsV0FBTixHQUFvQlgsTUFBcEIsR0FBNkIsQ0FBakMsRUFBb0M7QUFDbENVLGlCQUFTLElBQUlQLE1BQU1TLEtBQVYsRUFBVDtBQUNBVixjQUFNVyxHQUFOLENBQVVILE1BQVY7QUFDRCxPQUhELE1BSUs7QUFDSEEsaUJBQVNSLE1BQU1TLFdBQU4sR0FBb0IsQ0FBcEIsQ0FBVDtBQUNEOztBQUVELFVBQUlHLGdCQUFnQjtBQUNsQkMsY0FBTUMsU0FEWTtBQUVsQkMsa0JBQVUsTUFGUTtBQUdsQkMsaUJBQVMsRUFIUztBQUlsQjtBQUNBQyx1QkFBZUgsU0FMRztBQU1sQjtBQUNBSSw0QkFBb0JKLFNBUEY7QUFRbEJLLHVCQUFlLHVCQUFTQyxNQUFULEVBQWdCO0FBQzdCQSxpQkFBT0MsRUFBUCxDQUFVLHNCQUFWLEVBQWtDLEtBQUtDLFVBQXZDO0FBQ0QsU0FWaUI7QUFXbEJDLHlCQUFpQix5QkFBU0gsTUFBVCxFQUFnQjtBQUMvQkEsaUJBQU9JLEdBQVAsQ0FBVyxzQkFBWCxFQUFtQyxLQUFLRixVQUF4QztBQUNELFNBYmlCO0FBY2xCO0FBQ0E7QUFDQUEsb0JBQVksb0JBQVNHLEtBQVQsRUFBZTtBQUN6QjtBQUNBcEUsYUFBR3FFLGVBQUgsQ0FBbUIsS0FBbkI7O0FBRUE7QUFDQXZDLDBCQUFnQixJQUFoQjtBQUNBeUIsd0JBQWNLLGFBQWQsR0FBOEJRLE1BQU1FLE1BQXBDO0FBQ0F2QyxxQkFBVyxLQUFYO0FBQ0F3Qix3QkFBY0MsSUFBZCxDQUFtQmUsUUFBbkI7O0FBRUE7QUFDQSxjQUFJQyxZQUFZL0UscUJBQXFCZ0YsTUFBckIsQ0FBNEJsQixjQUFjRyxRQUExQyxFQUFvRCxRQUFwRCxDQUFoQjtBQUNBLGNBQUlnQixjQUFjakYscUJBQXFCZ0YsTUFBckIsQ0FBNEJsQixjQUFjRyxRQUExQyxFQUFvRCxVQUFwRCxDQUFsQjs7QUFFQSxjQUFJRixPQUFPRCxjQUFjQyxJQUF6QjtBQUNBbUIsNEJBQWtCO0FBQ2hCbkIsa0JBQU1BLElBRFU7QUFFaEJvQixrQkFBTXJCLGNBQWNHLFFBRko7QUFHaEJtQixxQkFBU3JCLEtBQUtzQixJQUFMLENBQVVOLFNBQVYsSUFBdUIsR0FBR08sTUFBSCxDQUFVdkIsS0FBS3NCLElBQUwsQ0FBVU4sU0FBVixDQUFWLENBQXZCLEdBQXlELEVBSGxEO0FBSWhCUSx1QkFBV3hCLEtBQUtzQixJQUFMLENBQVVKLFdBQVYsSUFBeUIsR0FBR0ssTUFBSCxDQUFVdkIsS0FBS3NCLElBQUwsQ0FBVUosV0FBVixDQUFWLENBQXpCLEdBQTZEO0FBSnhELFdBQWxCOztBQU9BTztBQUNBQzs7QUFFQWxGLGFBQUdtRixhQUFILENBQWlCLElBQWpCOztBQUVBaEMsaUJBQU9pQyxRQUFQLEdBQWtCcEIsRUFBbEIsQ0FBcUIsZ0NBQXJCLEVBQXVEVCxjQUFjOEIsUUFBckU7QUFDQWxDLGlCQUFPaUMsUUFBUCxHQUFrQnBCLEVBQWxCLENBQXFCLGlCQUFyQixFQUF3Q1QsY0FBYytCLFNBQXREO0FBQ0QsU0E3Q2lCO0FBOENsQjtBQUNBRCxrQkFBVSxrQkFBU2pCLEtBQVQsRUFBZTtBQUN2QjtBQUNBdEMsMEJBQWdCLEtBQWhCO0FBQ0F5Qix3QkFBY0ssYUFBZCxHQUE4QkgsU0FBOUI7QUFDQTFCLHFCQUFXLEtBQVg7QUFDQXdCLHdCQUFjQyxJQUFkLENBQW1CK0IsTUFBbkI7O0FBRUFDO0FBQ0FDOztBQUVBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBbUJBekYsYUFBR3FFLGVBQUgsQ0FBbUIsSUFBbkI7QUFDQXJFLGFBQUdtRixhQUFILENBQWlCLEtBQWpCOztBQUVBaEMsaUJBQU9pQyxRQUFQLEdBQWtCakIsR0FBbEIsQ0FBc0IsZ0NBQXRCLEVBQXdEWixjQUFjOEIsUUFBdEU7QUFDQWxDLGlCQUFPaUMsUUFBUCxHQUFrQmpCLEdBQWxCLENBQXNCLGlCQUF0QixFQUF5Q1osY0FBYytCLFNBQXZEO0FBQ0QsU0FqRmlCO0FBa0ZsQjtBQUNBQSxtQkFBVyxtQkFBVWxCLEtBQVYsRUFBZ0I7QUFDekJyQyxxQkFBVyxJQUFYO0FBQ0QsU0FyRmlCO0FBc0ZsQjJELDRCQUFvQiw4QkFBK0I7QUFBQTs7QUFBQSxjQUF0QkMsU0FBc0IsdUVBQVZsQyxTQUFVOztBQUNqRCxjQUFJbUMsbUJBQW1CLEtBQXZCOztBQUVBLGVBQUtqQyxPQUFMLENBQWFrQyxPQUFiLENBQXFCLFVBQUM5QixNQUFELEVBQVMrQixLQUFULEVBQW1CO0FBQ3RDLGdCQUFHSCxhQUFhNUIsV0FBVzRCLFNBQTNCLEVBQXFDO0FBQ25DQyxpQ0FBbUIsSUFBbkIsQ0FEbUMsQ0FDVjtBQUN6QjtBQUNEOztBQUVELGtCQUFLMUIsZUFBTCxDQUFxQkgsTUFBckI7QUFDQUEsbUJBQU9nQyxPQUFQO0FBQ0QsV0FSRDs7QUFVQSxjQUFHSCxnQkFBSCxFQUFvQjtBQUNsQixpQkFBS2pDLE9BQUwsR0FBZSxDQUFDZ0MsU0FBRCxDQUFmO0FBQ0QsV0FGRCxNQUdLO0FBQ0gsaUJBQUtoQyxPQUFMLEdBQWUsRUFBZjtBQUNBLGlCQUFLSCxJQUFMLEdBQVlDLFNBQVo7QUFDQSxpQkFBS0MsUUFBTCxHQUFnQixNQUFoQjtBQUNEO0FBQ0YsU0EzR2lCO0FBNEdsQjtBQUNBc0MsNEJBQW9CLDRCQUFTeEMsSUFBVCxFQUFlO0FBQ2pDLGVBQUtBLElBQUwsR0FBWUEsSUFBWjtBQUNBLGVBQUtFLFFBQUwsR0FBZ0JqRSxxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQWhCOztBQUVBLGNBQUcsQ0FBQ0EsS0FBSzBDLFFBQUwsQ0FBYywrQkFBZCxDQUFELElBQ0MsQ0FBQzFDLEtBQUswQyxRQUFMLENBQWMscUNBQWQsQ0FETCxFQUMyRDtBQUN6RDtBQUNEOztBQUVELGNBQUlDLGFBQWExRyxxQkFBcUIyRyxpQkFBckIsQ0FBdUM1QyxJQUF2QyxDQUFqQixDQVRpQyxDQVM2QjtBQUM5RCxjQUFJZixTQUFTNEQsc0JBQXNCN0MsSUFBdEIsSUFBOEIsSUFBM0M7O0FBRUEsY0FBSThDLFNBQVM5QyxLQUFLK0MsTUFBTCxHQUFjQyxRQUFkLEVBQWI7QUFDQSxjQUFJQyxTQUFTakQsS0FBS2MsTUFBTCxHQUFja0MsUUFBZCxFQUFiOztBQUVBLGVBQUksSUFBSUUsSUFBSSxDQUFaLEVBQWVQLGNBQWNPLElBQUlQLFdBQVcxRCxNQUE1QyxFQUFvRGlFLElBQUlBLElBQUksQ0FBNUQsRUFBOEQ7QUFDNUQsZ0JBQUlDLFVBQVVSLFdBQVdPLENBQVgsQ0FBZDtBQUNBLGdCQUFJRSxVQUFVVCxXQUFXTyxJQUFJLENBQWYsQ0FBZDs7QUFFQSxpQkFBS0csaUJBQUwsQ0FBdUJGLE9BQXZCLEVBQWdDQyxPQUFoQyxFQUF5Q25FLE1BQXpDO0FBQ0Q7O0FBRURVLGlCQUFPMkQsSUFBUDtBQUNELFNBcElpQjtBQXFJbEI7QUFDQUQsMkJBQW1CLDJCQUFTRixPQUFULEVBQWtCQyxPQUFsQixFQUEyQm5FLE1BQTNCLEVBQW1DO0FBQ3BEO0FBQ0EsY0FBSXNFLFdBQVdKLFVBQVVsRSxTQUFTLENBQWxDO0FBQ0EsY0FBSXVFLFdBQVdKLFVBQVVuRSxTQUFTLENBQWxDOztBQUVBO0FBQ0EsY0FBSXdFLHFCQUFxQkMsMEJBQTBCLEVBQUNDLEdBQUdKLFFBQUosRUFBY0ssR0FBR0osUUFBakIsRUFBMUIsQ0FBekI7QUFDQXZFLG9CQUFVekMsR0FBR3FILElBQUgsRUFBVjs7QUFFQSxjQUFJQyxZQUFZLElBQUkxRSxNQUFNMkUsSUFBVixDQUFlO0FBQzdCSixlQUFHRixtQkFBbUJFLENBRE87QUFFN0JDLGVBQUdILG1CQUFtQkcsQ0FGTztBQUc3Qm5FLG1CQUFPUixNQUhzQjtBQUk3QlMsb0JBQVFULE1BSnFCO0FBSzdCK0Usa0JBQU0sT0FMdUI7QUFNN0JDLHlCQUFhLENBTmdCO0FBTzdCQyx1QkFBVztBQVBrQixXQUFmLENBQWhCOztBQVVBLGVBQUsvRCxPQUFMLENBQWFnRSxJQUFiLENBQWtCTCxTQUFsQjtBQUNBLGVBQUt4RCxhQUFMLENBQW1Cd0QsU0FBbkI7QUFDQW5FLGlCQUFPRyxHQUFQLENBQVdnRSxTQUFYO0FBQ0Q7QUE1SmlCLE9BQXBCOztBQStKQSxVQUFJTSxnQkFBZ0IsU0FBaEJBLGFBQWdCLENBQVN4RCxLQUFULEVBQWU7QUFDakN5RCx3QkFBZ0J6RCxLQUFoQixFQUF1QixNQUF2QjtBQUNELE9BRkQ7O0FBSUEsVUFBSTBELG1CQUFtQixTQUFuQkEsZ0JBQW1CLENBQVMxRCxLQUFULEVBQWdCO0FBQ3JDeUQsd0JBQWdCekQsS0FBaEIsRUFBdUIsU0FBdkI7QUFDRCxPQUZEOztBQUlBLFVBQUl5RCxrQkFBa0IsU0FBbEJBLGVBQWtCLENBQVV6RCxLQUFWLEVBQWlCMkQsVUFBakIsRUFBNkI7QUFDakQsWUFBSXZFLE9BQU9ZLE1BQU1FLE1BQU4sSUFBZ0JGLE1BQU00RCxRQUFqQztBQUNBLFlBQUcsQ0FBQ3ZJLHFCQUFxQndJLGFBQXJCLENBQW1DekUsSUFBbkMsQ0FBSixFQUE4Qzs7QUFFNUMsY0FBSW9CLE9BQU9uRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQVg7QUFDQSxjQUFJcUIsT0FBSixFQUFhRyxTQUFiLEVBQXdCUixTQUF4QixFQUFtQ0UsV0FBbkM7O0FBRUEsY0FBR0UsU0FBUyxNQUFaLEVBQW1CO0FBQ2pCQyxzQkFBVSxFQUFWO0FBQ0FHLHdCQUFZLEVBQVo7QUFDRCxXQUhELE1BSUk7QUFDRlIsd0JBQVkvRSxxQkFBcUJnRixNQUFyQixDQUE0QkcsSUFBNUIsRUFBa0MsUUFBbEMsQ0FBWjtBQUNBRiwwQkFBY2pGLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxVQUFsQyxDQUFkOztBQUVBQyxzQkFBVXJCLEtBQUtzQixJQUFMLENBQVVOLFNBQVYsSUFBdUIsR0FBR08sTUFBSCxDQUFVdkIsS0FBS3NCLElBQUwsQ0FBVU4sU0FBVixDQUFWLENBQXZCLEdBQXlEaEIsS0FBS3NCLElBQUwsQ0FBVU4sU0FBVixDQUFuRTtBQUNBUSx3QkFBWXhCLEtBQUtzQixJQUFMLENBQVVKLFdBQVYsSUFBeUIsR0FBR0ssTUFBSCxDQUFVdkIsS0FBS3NCLElBQUwsQ0FBVUosV0FBVixDQUFWLENBQXpCLEdBQTZEbEIsS0FBS3NCLElBQUwsQ0FBVUosV0FBVixDQUF6RTtBQUNEOztBQUVELGNBQUl3RCxRQUFRO0FBQ1YxRSxrQkFBTUEsSUFESTtBQUVWb0Isa0JBQU1BLElBRkk7QUFHVkMscUJBQVNBLE9BSEM7QUFJVkcsdUJBQVdBO0FBSkQsV0FBWjs7QUFPQTtBQUNBdkYsK0JBQXFCMEksY0FBckIsQ0FBb0MxRSxTQUFwQyxFQUErQ0EsU0FBL0MsRUFBMERzRSxVQUExRDs7QUFFQSxjQUFJN0gsVUFBVWtJLFFBQWQsRUFBd0I7QUFDdEJwSSxlQUFHcUksUUFBSCxHQUFjQyxFQUFkLENBQWlCLG9CQUFqQixFQUF1Q0osS0FBdkM7QUFDRDtBQUNGOztBQUVESztBQUNBL0UsYUFBSytCLE1BQUw7QUFDRCxPQXBDRDs7QUFzQ0EsVUFBSWlELHFCQUFxQixTQUFyQkEsa0JBQXFCLENBQVVwRSxLQUFWLEVBQWlCO0FBQ3hDLFlBQUlaLE9BQU9ELGNBQWNDLElBQXpCO0FBQ0EsWUFBSW9CLE9BQU9uRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQVg7O0FBRUEsWUFBRy9ELHFCQUFxQmdKLDBCQUFyQixDQUFnRDdELElBQWhELEVBQXNELG9DQUF0RCxDQUFILEVBQStGO0FBQzdGO0FBQ0Q7O0FBRUQsWUFBSXNELFFBQVE7QUFDVjFFLGdCQUFNQSxJQURJO0FBRVZvQixnQkFBTUEsSUFGSTtBQUdWQyxtQkFBUyxHQUFHRSxNQUFILENBQVV2QixLQUFLc0IsSUFBTCxDQUFVckYscUJBQXFCZ0YsTUFBckIsQ0FBNEJHLElBQTVCLEVBQWtDLFFBQWxDLENBQVYsQ0FBVixDQUhDO0FBSVZJLHFCQUFXLEdBQUdELE1BQUgsQ0FBVXZCLEtBQUtzQixJQUFMLENBQVVyRixxQkFBcUJnRixNQUFyQixDQUE0QkcsSUFBNUIsRUFBa0MsVUFBbEMsQ0FBVixDQUFWO0FBSkQsU0FBWjs7QUFPQW5GLDZCQUFxQmlKLFlBQXJCOztBQUVBLFlBQUd4SSxVQUFVa0ksUUFBYixFQUF1QjtBQUNyQnBJLGFBQUdxSSxRQUFILEdBQWNDLEVBQWQsQ0FBaUIsb0JBQWpCLEVBQXVDSixLQUF2QztBQUNEOztBQUVEUyxtQkFBVyxZQUFVO0FBQUNKLHlCQUFlL0UsS0FBSytCLE1BQUw7QUFBZSxTQUFwRCxFQUFzRCxFQUF0RDtBQUVELE9BdkJEOztBQXlCQSxVQUFJcUQseUJBQXlCLFNBQXpCQSxzQkFBeUIsQ0FBVXhFLEtBQVYsRUFBaUI7QUFDNUMsWUFBSVosT0FBT0QsY0FBY0MsSUFBekI7QUFDQSxZQUFJb0IsT0FBT25GLHFCQUFxQndHLFdBQXJCLENBQWlDekMsSUFBakMsQ0FBWDtBQUNBLFlBQUkwRSxRQUFRO0FBQ1YxRSxnQkFBTUEsSUFESTtBQUVWb0IsZ0JBQU1BLElBRkk7QUFHVkMsbUJBQVMsR0FBR0UsTUFBSCxDQUFVdkIsS0FBS3NCLElBQUwsQ0FBVXJGLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxRQUFsQyxDQUFWLENBQVYsQ0FIQztBQUlWSSxxQkFBVyxHQUFHRCxNQUFILENBQVV2QixLQUFLc0IsSUFBTCxDQUFVckYscUJBQXFCZ0YsTUFBckIsQ0FBNEJHLElBQTVCLEVBQWtDLFVBQWxDLENBQVYsQ0FBVjtBQUpELFNBQVo7O0FBT0FuRiw2QkFBcUJvSixnQkFBckI7O0FBRUEsWUFBSTNJLFVBQVVrSSxRQUFkLEVBQXdCO0FBQ3RCcEksYUFBR3FJLFFBQUgsR0FBY0MsRUFBZCxDQUFpQixvQkFBakIsRUFBdUNKLEtBQXZDO0FBQ0Q7QUFDRFMsbUJBQVcsWUFBVTtBQUFDSix5QkFBZS9FLEtBQUsrQixNQUFMO0FBQWUsU0FBcEQsRUFBc0QsRUFBdEQ7QUFDRCxPQWhCRDs7QUFrQkE7QUFDQSxVQUFJdUQsc0JBQXNCM0csS0FBSzJHLG1CQUEvQjtBQUNBO0FBQ0EsVUFBSUMsZUFBZTVHLEtBQUs0RyxZQUF4QjtBQUNBO0FBQ0EsVUFBSUMsZ0NBQWdDN0csS0FBSzZHLDZCQUF6Qzs7QUFFQSxVQUFJQyxZQUFZLENBQ2Q7QUFDRWxHLFlBQUk1QyxxQkFETjtBQUVFK0ksaUJBQVMvRyxLQUFLZ0gsb0JBRmhCO0FBR0VDLGtCQUFVLE1BSFo7QUFJRUMseUJBQWlCekIsYUFKbkI7QUFLRTBCLDRCQUFvQm5ILEtBQUtvSDtBQUwzQixPQURjLEVBUWQ7QUFDRXhHLFlBQUkzQyx3QkFETjtBQUVFOEksaUJBQVMvRyxLQUFLcUgsdUJBRmhCO0FBR0VKLGtCQUFVLE1BSFo7QUFJRUMseUJBQWlCYixrQkFKbkI7QUFLRWMsNEJBQW9CbkgsS0FBS29IO0FBTDNCLE9BUmMsRUFlZDtBQUNFeEcsWUFBSTFDLDJCQUROO0FBRUU2SSxpQkFBUy9HLEtBQUtzSCwwQkFGaEI7QUFHRUwsa0JBQVVqSCxLQUFLdUgsaUNBQUwsSUFBMEMsaURBSHREO0FBSUVMLHlCQUFpQlQsc0JBSm5CO0FBS0VVLDRCQUFvQm5ILEtBQUtvSDtBQUwzQixPQWZjLEVBc0JkO0FBQ0V4RyxZQUFJekMsd0JBRE47QUFFRTRJLGlCQUFTL0csS0FBS3dILHVCQUZoQjtBQUdFUCxrQkFBVSxNQUhaO0FBSUVRLG9CQUFZLElBSmQ7QUFLRVAseUJBQWlCdkIsZ0JBTG5CO0FBTUV3Qiw0QkFBb0JuSCxLQUFLb0g7QUFOM0IsT0F0QmMsRUE4QmQ7QUFDRXhHLFlBQUl4QywyQkFETjtBQUVFMkksaUJBQVMvRyxLQUFLMEgsMEJBRmhCO0FBR0VULGtCQUFVLE1BSFo7QUFJRVEsb0JBQVksSUFKZDtBQUtFUCx5QkFBaUJiLGtCQUxuQjtBQU1FYyw0QkFBb0JuSCxLQUFLb0g7QUFOM0IsT0E5QmMsRUFzQ2Q7QUFDRXhHLFlBQUl2Qyw4QkFETjtBQUVFMEksaUJBQVMvRyxLQUFLMkgsNkJBRmhCO0FBR0VWLGtCQUFVakgsS0FBS3VILGlDQUFMLElBQTBDLHVEQUh0RDtBQUlFTCx5QkFBaUJULHNCQUpuQjtBQUtFVSw0QkFBb0JuSCxLQUFLb0g7QUFMM0IsT0F0Q2MsQ0FBaEI7O0FBK0NBLFVBQUd2SixHQUFHK0osWUFBTixFQUFvQjtBQUNsQixZQUFJQyxRQUFRaEssR0FBRytKLFlBQUgsQ0FBZ0IsS0FBaEIsQ0FBWjtBQUNBO0FBQ0E7QUFDQSxZQUFJQyxNQUFNQyxRQUFOLEVBQUosRUFBc0I7QUFDcEJELGdCQUFNRSxlQUFOLENBQXNCakIsU0FBdEI7QUFDRCxTQUZELE1BR0s7QUFDSGpKLGFBQUcrSixZQUFILENBQWdCO0FBQ2RkLHVCQUFXQTtBQURHLFdBQWhCO0FBR0Q7QUFDRjs7QUFFRCxVQUFJa0IsY0FBYzVLLFNBQVMsWUFBWTtBQUNyQ2dELHVCQUNHNkgsSUFESCxDQUNRLFFBRFIsRUFDa0JoSSxXQUFXYyxNQUFYLEVBRGxCLEVBRUdrSCxJQUZILENBRVEsT0FGUixFQUVpQmhJLFdBQVdhLEtBQVgsRUFGakIsRUFHR29ILEdBSEgsQ0FHTztBQUNILHNCQUFZLFVBRFQ7QUFFSCxpQkFBTyxDQUZKO0FBR0gsa0JBQVEsQ0FITDtBQUlILHFCQUFXbkssVUFBVW9LO0FBSmxCLFNBSFA7O0FBV0EzQixtQkFBVyxZQUFZO0FBQ3JCLGNBQUk0QixXQUFXaEksZUFBZWlJLE1BQWYsRUFBZjtBQUNBLGNBQUlDLGNBQWNySSxXQUFXb0ksTUFBWCxFQUFsQjs7QUFFQWpJLHlCQUNHOEgsR0FESCxDQUNPO0FBQ0gsbUJBQU8sRUFBRUUsU0FBU0csR0FBVCxHQUFlRCxZQUFZQyxHQUE3QixDQURKO0FBRUgsb0JBQVEsRUFBRUgsU0FBU0ksSUFBVCxHQUFnQkYsWUFBWUUsSUFBOUI7QUFGTCxXQURQOztBQU9BeEgsaUJBQU9pQyxRQUFQLEdBQWtCd0YsUUFBbEIsQ0FBMkJ4SSxXQUFXYSxLQUFYLEVBQTNCO0FBQ0FFLGlCQUFPaUMsUUFBUCxHQUFrQnlGLFNBQWxCLENBQTRCekksV0FBV2MsTUFBWCxFQUE1Qjs7QUFFQTtBQUNBLGNBQUdsRCxFQUFILEVBQU07QUFDSnVJO0FBQ0Q7QUFDRixTQWxCRCxFQWtCRyxDQWxCSDtBQW9CRCxPQWhDaUIsRUFnQ2YsR0FoQ2UsQ0FBbEI7O0FBa0NBLGVBQVN1QyxVQUFULEdBQXNCO0FBQ3BCWDtBQUNEOztBQUVEVzs7QUFFQXpJLFFBQUUwSSxNQUFGLEVBQVVDLElBQVYsQ0FBZSxRQUFmLEVBQXlCLFlBQVk7QUFDbkNGO0FBQ0QsT0FGRDs7QUFJQTtBQUNBLFVBQUloRyxPQUFPMUMsV0FBVzBDLElBQVgsQ0FBZ0IsZUFBaEIsQ0FBWDtBQUNBLFVBQUlBLFFBQVEsSUFBWixFQUFrQjtBQUNoQkEsZUFBTyxFQUFQO0FBQ0Q7QUFDREEsV0FBSzVFLE9BQUwsR0FBZWlDLElBQWY7O0FBRUEsVUFBSThJLFFBQUo7O0FBRUEsZUFBUy9LLE9BQVQsR0FBbUI7QUFDakIsZUFBTytLLGFBQWFBLFdBQVc3SSxXQUFXMEMsSUFBWCxDQUFnQixlQUFoQixFQUFpQzVFLE9BQXpELENBQVA7QUFDRDs7QUFFRDtBQUNBLGVBQVNnSCx5QkFBVCxDQUFtQ2dFLGFBQW5DLEVBQWtEO0FBQ2hELFlBQUlDLE1BQU1uTCxHQUFHbUwsR0FBSCxFQUFWO0FBQ0EsWUFBSTlELE9BQU9ySCxHQUFHcUgsSUFBSCxFQUFYOztBQUVBLFlBQUlGLElBQUkrRCxjQUFjL0QsQ0FBZCxHQUFrQkUsSUFBbEIsR0FBeUI4RCxJQUFJaEUsQ0FBckM7QUFDQSxZQUFJQyxJQUFJOEQsY0FBYzlELENBQWQsR0FBa0JDLElBQWxCLEdBQXlCOEQsSUFBSS9ELENBQXJDOztBQUVBLGVBQU87QUFDTEQsYUFBR0EsQ0FERTtBQUVMQyxhQUFHQTtBQUZFLFNBQVA7QUFJRDs7QUFFRCxlQUFTbUIsWUFBVCxHQUF3Qjs7QUFFdEI7QUFDQWhGLHNCQUFjbUMsa0JBQWQsQ0FBaUNuQyxjQUFjSyxhQUEvQzs7QUFFQSxZQUFHaEMsbUJBQW1CLElBQXRCLEVBQTJCO0FBQ3pCQSx5QkFBZW1FLE9BQWY7QUFDQW5FLDJCQUFpQixJQUFqQjtBQUNEO0FBQ0QsWUFBR0MsbUJBQW1CLElBQXRCLEVBQTJCO0FBQ3pCQSx5QkFBZWtFLE9BQWY7QUFDQWxFLDJCQUFpQixJQUFqQjtBQUNEO0FBQ0RzQixlQUFPMkQsSUFBUDs7QUFFQSxZQUFJcEYsZUFBSixFQUFzQjtBQUNwQjZCLHdCQUFjeUMsa0JBQWQsQ0FBaUN0RSxlQUFqQztBQUNBMEosK0JBQXFCMUosZUFBckI7QUFDRDtBQUNGOztBQUVEO0FBQ0EsZUFBUzBKLG9CQUFULENBQThCNUgsSUFBOUIsRUFBb0M7QUFDbEMsWUFBRyxDQUFDQSxJQUFKLEVBQVM7QUFDUDtBQUNEOztBQUVELFlBQUk2SCxXQUFXNUwscUJBQXFCMkcsaUJBQXJCLENBQXVDNUMsSUFBdkMsQ0FBZjtBQUNBLFlBQUcsT0FBTzZILFFBQVAsS0FBb0IsV0FBdkIsRUFBbUM7QUFDakNBLHFCQUFXLEVBQVg7QUFDRDtBQUNELFlBQUlDLFlBQVk5SCxLQUFLK0gsY0FBTCxFQUFoQjtBQUNBLFlBQUlDLFlBQVloSSxLQUFLaUksY0FBTCxFQUFoQjs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBSSxDQUFDSCxVQUFVbkUsQ0FBWCxJQUFnQixDQUFDcUUsVUFBVXJFLENBQS9CLEVBQWtDO0FBQ2hDO0FBQ0Q7O0FBRURrRSxpQkFBU0ssT0FBVCxDQUFpQkosVUFBVWxFLENBQTNCO0FBQ0FpRSxpQkFBU0ssT0FBVCxDQUFpQkosVUFBVW5FLENBQTNCO0FBQ0FrRSxpQkFBUzFELElBQVQsQ0FBYzZELFVBQVVyRSxDQUF4QjtBQUNBa0UsaUJBQVMxRCxJQUFULENBQWM2RCxVQUFVcEUsQ0FBeEI7O0FBR0EsWUFBRyxDQUFDaUUsUUFBSixFQUNFOztBQUVGLFlBQUlNLE1BQU07QUFDUnhFLGFBQUdrRSxTQUFTLENBQVQsQ0FESztBQUVSakUsYUFBR2lFLFNBQVMsQ0FBVDtBQUZLLFNBQVY7O0FBS0EsWUFBSS9HLFNBQVM7QUFDWDZDLGFBQUdrRSxTQUFTQSxTQUFTNUksTUFBVCxHQUFnQixDQUF6QixDQURRO0FBRVgyRSxhQUFHaUUsU0FBU0EsU0FBUzVJLE1BQVQsR0FBZ0IsQ0FBekI7QUFGUSxTQUFiOztBQUtBLFlBQUltSixlQUFlO0FBQ2pCekUsYUFBR2tFLFNBQVMsQ0FBVCxDQURjO0FBRWpCakUsYUFBR2lFLFNBQVMsQ0FBVDtBQUZjLFNBQW5CO0FBSUEsWUFBSVEsZUFBZTtBQUNqQjFFLGFBQUdrRSxTQUFTQSxTQUFTNUksTUFBVCxHQUFnQixDQUF6QixDQURjO0FBRWpCMkUsYUFBR2lFLFNBQVNBLFNBQVM1SSxNQUFULEdBQWdCLENBQXpCO0FBRmMsU0FBbkI7QUFJQSxZQUFJQSxTQUFTNEQsc0JBQXNCN0MsSUFBdEIsSUFBOEIsSUFBM0M7O0FBRUFzSSxnQ0FBd0JILEdBQXhCLEVBQTZCckgsTUFBN0IsRUFBcUM3QixNQUFyQyxFQUE0Q21KLFlBQTVDLEVBQXlEQyxZQUF6RDtBQUVEOztBQUVELGVBQVNDLHVCQUFULENBQWlDdkYsTUFBakMsRUFBeUNqQyxNQUF6QyxFQUFpRDdCLE1BQWpELEVBQXdEbUosWUFBeEQsRUFBcUVDLFlBQXJFLEVBQW1GO0FBQ2pGO0FBQ0EsWUFBSUUsWUFBWXhGLE9BQU9ZLENBQVAsR0FBVzFFLFNBQVMsQ0FBcEM7QUFDQSxZQUFJdUosWUFBWXpGLE9BQU9hLENBQVAsR0FBVzNFLFNBQVMsQ0FBcEM7O0FBRUEsWUFBSXdKLFlBQVkzSCxPQUFPNkMsQ0FBUCxHQUFXMUUsU0FBUyxDQUFwQztBQUNBLFlBQUl5SixZQUFZNUgsT0FBTzhDLENBQVAsR0FBVzNFLFNBQVMsQ0FBcEM7O0FBRUEsWUFBSTBKLGdCQUFnQlAsYUFBYXpFLENBQWIsR0FBaUIxRSxTQUFRLENBQTdDO0FBQ0EsWUFBSTJKLGdCQUFnQlIsYUFBYXhFLENBQWIsR0FBaUIzRSxTQUFTLENBQTlDOztBQUVBLFlBQUk0SixnQkFBZ0JSLGFBQWExRSxDQUFiLEdBQWlCMUUsU0FBUSxDQUE3QztBQUNBLFlBQUk2SixnQkFBZ0JULGFBQWF6RSxDQUFiLEdBQWlCM0UsU0FBUSxDQUE3Qzs7QUFHQTtBQUNBLFlBQUk4SixvQkFBb0JyRiwwQkFBMEIsRUFBQ0MsR0FBRzRFLFNBQUosRUFBZTNFLEdBQUc0RSxTQUFsQixFQUExQixDQUF4QjtBQUNBLFlBQUlRLG9CQUFvQnRGLDBCQUEwQixFQUFDQyxHQUFHOEUsU0FBSixFQUFlN0UsR0FBRzhFLFNBQWxCLEVBQTFCLENBQXhCO0FBQ0F6SixpQkFBU0EsU0FBU3pDLEdBQUdxSCxJQUFILEVBQVQsR0FBcUIsQ0FBOUI7O0FBRUEsWUFBSW9GLHVCQUF1QnZGLDBCQUEwQixFQUFDQyxHQUFHZ0YsYUFBSixFQUFtQi9FLEdBQUdnRixhQUF0QixFQUExQixDQUEzQjtBQUNBLFlBQUlNLHVCQUF1QnhGLDBCQUEwQixFQUFDQyxHQUFHa0YsYUFBSixFQUFtQmpGLEdBQUdrRixhQUF0QixFQUExQixDQUEzQjs7QUFFQTtBQUNBLFlBQUlLLG1CQUFtQmxLLE1BQXZCOztBQUVBLFlBQUltSyxpQkFBaUJDLEtBQUtDLElBQUwsQ0FBVUQsS0FBS0UsR0FBTCxDQUFTTixxQkFBcUJ0RixDQUFyQixHQUF5Qm9GLGtCQUFrQnBGLENBQXBELEVBQXNELENBQXRELElBQTJEMEYsS0FBS0UsR0FBTCxDQUFTTixxQkFBcUJyRixDQUFyQixHQUF5Qm1GLGtCQUFrQm5GLENBQXBELEVBQXNELENBQXRELENBQXJFLENBQXJCO0FBQ0EsWUFBSTRGLGtCQUFrQlQsa0JBQWtCcEYsQ0FBbEIsR0FBd0J3RixtQkFBa0JDLGNBQW5CLElBQXFDSCxxQkFBcUJ0RixDQUFyQixHQUF5Qm9GLGtCQUFrQnBGLENBQWhGLENBQTdDO0FBQ0EsWUFBSThGLGtCQUFrQlYsa0JBQWtCbkYsQ0FBbEIsR0FBd0J1RixtQkFBa0JDLGNBQW5CLElBQXFDSCxxQkFBcUJyRixDQUFyQixHQUF5Qm1GLGtCQUFrQm5GLENBQWhGLENBQTdDOztBQUdBLFlBQUk4RixpQkFBaUJMLEtBQUtDLElBQUwsQ0FBVUQsS0FBS0UsR0FBTCxDQUFTTCxxQkFBcUJ2RixDQUFyQixHQUF5QnFGLGtCQUFrQnJGLENBQXBELEVBQXNELENBQXRELElBQTJEMEYsS0FBS0UsR0FBTCxDQUFTTCxxQkFBcUJ0RixDQUFyQixHQUF5Qm9GLGtCQUFrQnBGLENBQXBELEVBQXNELENBQXRELENBQXJFLENBQXJCO0FBQ0EsWUFBSStGLGtCQUFrQlgsa0JBQWtCckYsQ0FBbEIsR0FBd0J3RixtQkFBa0JPLGNBQW5CLElBQXFDUixxQkFBcUJ2RixDQUFyQixHQUF5QnFGLGtCQUFrQnJGLENBQWhGLENBQTdDO0FBQ0EsWUFBSWlHLGtCQUFrQlosa0JBQWtCcEYsQ0FBbEIsR0FBd0J1RixtQkFBa0JPLGNBQW5CLElBQXFDUixxQkFBcUJ0RixDQUFyQixHQUF5Qm9GLGtCQUFrQnBGLENBQWhGLENBQTdDOztBQUVBO0FBQ0E7QUFDQTtBQUNBLFlBQUd4RixtQkFBbUIsSUFBdEIsRUFBMkI7QUFDekJBLDJCQUFpQixJQUFJZ0IsTUFBTXlLLE1BQVYsQ0FBaUI7QUFDaENsRyxlQUFHNkYsa0JBQWtCdkssTUFEVztBQUVoQzJFLGVBQUc2RixrQkFBa0J4SyxNQUZXO0FBR2hDNkssb0JBQVE3SyxNQUh3QjtBQUloQytFLGtCQUFNO0FBSjBCLFdBQWpCLENBQWpCO0FBTUQ7O0FBRUQsWUFBRzNGLG1CQUFtQixJQUF0QixFQUEyQjtBQUN6QkEsMkJBQWlCLElBQUllLE1BQU15SyxNQUFWLENBQWlCO0FBQ2hDbEcsZUFBR2dHLGtCQUFrQjFLLE1BRFc7QUFFaEMyRSxlQUFHZ0csa0JBQWtCM0ssTUFGVztBQUdoQzZLLG9CQUFRN0ssTUFId0I7QUFJaEMrRSxrQkFBTTtBQUowQixXQUFqQixDQUFqQjtBQU1EOztBQUVEckUsZUFBT0csR0FBUCxDQUFXMUIsY0FBWDtBQUNBdUIsZUFBT0csR0FBUCxDQUFXekIsY0FBWDtBQUNBc0IsZUFBTzJELElBQVA7QUFFRDs7QUFFRDtBQUNBLGVBQVNULHFCQUFULENBQStCN0MsSUFBL0IsRUFBcUM7QUFDbkMsWUFBSStKLFNBQVNyTixVQUFVc04scUJBQXZCO0FBQ0EsWUFBSUMsV0FBV2pLLEtBQUs2RyxHQUFMLENBQVMsT0FBVCxDQUFYLEtBQWlDLEdBQXJDLEVBQ0UsT0FBTyxNQUFNa0QsTUFBYixDQURGLEtBRUssT0FBT0UsV0FBV2pLLEtBQUs2RyxHQUFMLENBQVMsT0FBVCxDQUFYLElBQThCa0QsTUFBckM7QUFDTjs7QUFFRDtBQUNBLGVBQVNHLGtCQUFULENBQTRCdkcsQ0FBNUIsRUFBK0JDLENBQS9CLEVBQWtDM0UsTUFBbEMsRUFBMENrTCxPQUExQyxFQUFtREMsT0FBbkQsRUFBMkQ7QUFDekQsWUFBSUMsT0FBT0YsVUFBVWxMLFNBQVMsQ0FBOUI7QUFDQSxZQUFJcUwsT0FBT0gsVUFBVWxMLFNBQVMsQ0FBOUI7QUFDQSxZQUFJc0wsT0FBT0gsVUFBVW5MLFNBQVMsQ0FBOUI7QUFDQSxZQUFJdUwsT0FBT0osVUFBVW5MLFNBQVMsQ0FBOUI7O0FBRUEsWUFBSXdMLFNBQVU5RyxLQUFLMEcsSUFBTCxJQUFhMUcsS0FBSzJHLElBQW5CLElBQTZCMUcsS0FBSzJHLElBQUwsSUFBYTNHLEtBQUs0RyxJQUE1RDtBQUNBLGVBQU9DLE1BQVA7QUFDRDs7QUFFRDtBQUNBLGVBQVNDLHVCQUFULENBQWlDL0csQ0FBakMsRUFBb0NDLENBQXBDLEVBQXVDNUQsSUFBdkMsRUFBNkM7QUFDM0MsWUFBSW9CLE9BQU9uRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQVg7O0FBRUEsWUFBR29CLFNBQVMsTUFBWixFQUFtQjtBQUNqQixpQkFBTyxDQUFDLENBQVI7QUFDRDs7QUFFRCxZQUFHcEIsS0FBS3NCLElBQUwsQ0FBVXJGLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxRQUFsQyxDQUFWLEtBQTBELElBQTFELElBQ0RwQixLQUFLc0IsSUFBTCxDQUFVckYscUJBQXFCZ0YsTUFBckIsQ0FBNEJHLElBQTVCLEVBQWtDLFFBQWxDLENBQVYsRUFBdURuQyxNQUF2RCxJQUFpRSxDQURuRSxFQUNxRTtBQUNuRSxpQkFBTyxDQUFDLENBQVI7QUFDRDs7QUFFRCxZQUFJMEQsYUFBYTFHLHFCQUFxQjJHLGlCQUFyQixDQUF1QzVDLElBQXZDLENBQWpCLENBWjJDLENBWW1CO0FBQzlELFlBQUlmLFNBQVM0RCxzQkFBc0I3QyxJQUF0QixDQUFiOztBQUVBLGFBQUksSUFBSWtELElBQUksQ0FBWixFQUFlUCxjQUFjTyxJQUFJUCxXQUFXMUQsTUFBNUMsRUFBb0RpRSxJQUFJQSxJQUFJLENBQTVELEVBQThEO0FBQzVELGNBQUlDLFVBQVVSLFdBQVdPLENBQVgsQ0FBZDtBQUNBLGNBQUlFLFVBQVVULFdBQVdPLElBQUksQ0FBZixDQUFkOztBQUVBLGNBQUl1SCxTQUFTUCxtQkFBbUJ2RyxDQUFuQixFQUFzQkMsQ0FBdEIsRUFBeUIzRSxNQUF6QixFQUFpQ2tFLE9BQWpDLEVBQTBDQyxPQUExQyxDQUFiO0FBQ0EsY0FBR3FILE1BQUgsRUFBVTtBQUNSLG1CQUFPdkgsSUFBSSxDQUFYO0FBQ0Q7QUFDRjs7QUFFRCxlQUFPLENBQUMsQ0FBUjtBQUNEOztBQUVELGVBQVN5SCxxQkFBVCxDQUErQmhILENBQS9CLEVBQWtDQyxDQUFsQyxFQUFxQzVELElBQXJDLEVBQTBDO0FBQ3hDLFlBQUlmLFNBQVM0RCxzQkFBc0I3QyxJQUF0QixDQUFiO0FBQ0EsWUFBSTRLLFNBQVM1SyxLQUFLNkssUUFBTCxDQUFjQyxRQUFkLENBQXVCQyxNQUFwQztBQUNBLFlBQUk1QyxNQUFNO0FBQ1J4RSxhQUFHaUgsT0FBTyxDQUFQLENBREs7QUFFUmhILGFBQUdnSCxPQUFPLENBQVA7QUFGSyxTQUFWO0FBSUEsWUFBSTlKLFNBQVM7QUFDWDZDLGFBQUdpSCxPQUFPQSxPQUFPM0wsTUFBUCxHQUFjLENBQXJCLENBRFE7QUFFWDJFLGFBQUdnSCxPQUFPQSxPQUFPM0wsTUFBUCxHQUFjLENBQXJCO0FBRlEsU0FBYjtBQUlBeUUsa0NBQTBCeUUsR0FBMUI7QUFDQXpFLGtDQUEwQjVDLE1BQTFCOztBQUVBO0FBQ0EsWUFBR29KLG1CQUFtQnZHLENBQW5CLEVBQXNCQyxDQUF0QixFQUF5QjNFLE1BQXpCLEVBQWlDa0osSUFBSXhFLENBQXJDLEVBQXdDd0UsSUFBSXZFLENBQTVDLENBQUgsRUFDRSxPQUFPLENBQVAsQ0FERixLQUVLLElBQUdzRyxtQkFBbUJ2RyxDQUFuQixFQUFzQkMsQ0FBdEIsRUFBeUIzRSxNQUF6QixFQUFpQzZCLE9BQU82QyxDQUF4QyxFQUEyQzdDLE9BQU84QyxDQUFsRCxDQUFILEVBQ0gsT0FBTyxDQUFQLENBREcsS0FHSCxPQUFPLENBQUMsQ0FBUjtBQUNIOztBQUVEO0FBQ0EsZUFBU2xDLGVBQVQsR0FBMkI7QUFDekI1RCw2QkFBcUJ0QixHQUFHd08sY0FBSCxFQUFyQjtBQUNBak4sNkJBQXFCdkIsR0FBR3lPLGNBQUgsRUFBckI7QUFDQWpOLGtDQUEwQnhCLEdBQUcwTyxtQkFBSCxFQUExQjs7QUFFQTFPLFdBQUd5TyxjQUFILENBQWtCLEtBQWxCLEVBQ0dELGNBREgsQ0FDa0IsS0FEbEIsRUFFR0UsbUJBRkgsQ0FFdUIsS0FGdkI7QUFHRDs7QUFFRDtBQUNBLGVBQVNqSixhQUFULEdBQXlCO0FBQ3ZCekYsV0FBR3lPLGNBQUgsQ0FBa0JsTixrQkFBbEIsRUFDR2lOLGNBREgsQ0FDa0JsTixrQkFEbEIsRUFFR29OLG1CQUZILENBRXVCbE4sdUJBRnZCO0FBR0Q7O0FBRUQsZUFBU3lELG9CQUFULEdBQStCO0FBQzdCO0FBQ0EsWUFBSWpGLEdBQUcyTyxLQUFILEdBQVdOLFFBQVgsQ0FBb0JPLFNBQXBCLENBQThCLG1CQUE5QixDQUFKLEVBQXdEO0FBQ3REbk4sZ0NBQXNCekIsR0FBRzJPLEtBQUgsR0FBV04sUUFBWCxDQUFvQk8sU0FBcEIsQ0FBOEIsbUJBQTlCLEVBQW1EQyxLQUF6RTtBQUNELFNBRkQsTUFHSztBQUNIO0FBQ0E7QUFDQXBOLGdDQUFzQixJQUF0QjtBQUNEOztBQUVEekIsV0FBRzJPLEtBQUgsR0FDR3ZGLFFBREgsQ0FDWSxNQURaLEVBRUd1RixLQUZILENBRVMsbUJBRlQsRUFFOEIsQ0FGOUIsRUFHR0csTUFISDtBQUlEOztBQUVELGVBQVN0SixrQkFBVCxHQUE2QjtBQUMzQnhGLFdBQUcyTyxLQUFILEdBQ0d2RixRQURILENBQ1ksTUFEWixFQUVHdUYsS0FGSCxDQUVTLG1CQUZULEVBRThCbE4sbUJBRjlCLEVBR0dxTixNQUhIO0FBSUQ7O0FBRUQsZUFBU0MsZ0JBQVQsQ0FBMEJDLFlBQTFCLEVBQXdDQyxLQUF4QyxFQUErQztBQUMzQ0EsY0FBTXBKLE9BQU4sQ0FBYyxVQUFVckMsSUFBVixFQUFnQjtBQUMxQixjQUFJMEwsMEJBQTBCelAscUJBQXFCMkcsaUJBQXJCLENBQXVDNUMsSUFBdkMsQ0FBOUI7QUFDQSxjQUFJMkwsMkJBQTJCLEVBQS9CO0FBQ0EsY0FBSUQsMkJBQTJCekwsU0FBL0IsRUFDQTtBQUNFLGlCQUFLLElBQUlpRCxJQUFFLENBQVgsRUFBY0EsSUFBRXdJLHdCQUF3QnpNLE1BQXhDLEVBQWdEaUUsS0FBRyxDQUFuRCxFQUNBO0FBQ0l5SSx1Q0FBeUJ4SCxJQUF6QixDQUE4QixFQUFDUixHQUFHK0gsd0JBQXdCeEksQ0FBeEIsSUFBMkJzSSxhQUFhN0gsQ0FBNUMsRUFBK0NDLEdBQUc4SCx3QkFBd0J4SSxJQUFFLENBQTFCLElBQTZCc0ksYUFBYTVILENBQTVGLEVBQTlCO0FBQ0g7QUFDRCxnQkFBSXhDLE9BQU9uRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQVg7O0FBRUEsZ0JBQUcvRCxxQkFBcUJnSiwwQkFBckIsQ0FBZ0Q3RCxJQUFoRCxFQUFzRCxrQ0FBdEQsQ0FBSCxFQUE2RjtBQUMzRjtBQUNEOztBQUVELGdCQUFJQSxTQUFTLE1BQWIsRUFBcUI7QUFDbkI3RSxxQkFBT3FQLGdDQUFQLENBQXdDNUwsSUFBeEMsRUFBOEMyTCx3QkFBOUM7QUFDRCxhQUZELE1BR0ssSUFBSXZLLFNBQVMsU0FBYixFQUF3QjtBQUMzQjdFLHFCQUFPc1AsbUNBQVAsQ0FBMkM3TCxJQUEzQyxFQUFpRDJMLHdCQUFqRDtBQUNEO0FBQ0Y7QUFDSixTQXRCRDtBQXVCQTFQLDZCQUFxQjZQLGdCQUFyQixDQUFzQ3BQLFVBQVVxUCxxQkFBaEQsRUFBdUVyUCxVQUFVc1Asd0JBQWpGLEVBQTJHUCxLQUEzRzs7QUFFQTtBQUNBO0FBQ0FqUCxXQUFHeVAsT0FBSCxDQUFXLG1CQUFYO0FBQ0g7O0FBRUQsZUFBU0MsZ0JBQVQsQ0FBMEJsTSxJQUExQixFQUFnQ29CLElBQWhDLEVBQXNDa0IsS0FBdEMsRUFBNkNVLFFBQTdDLEVBQXNEO0FBQ3BELFlBQUkzQixVQUFVckIsS0FBS3NCLElBQUwsQ0FBVXJGLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxRQUFsQyxDQUFWLENBQWQ7QUFDQSxZQUFJSSxZQUFZeEIsS0FBS3NCLElBQUwsQ0FBVXJGLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxVQUFsQyxDQUFWLENBQWhCOztBQUVBLFlBQUkrSyx5QkFBeUJsUSxxQkFBcUJtUSx5QkFBckIsQ0FBK0NwTSxJQUEvQyxFQUFxRGdELFFBQXJELENBQTdCO0FBQ0EzQixnQkFBUWlCLEtBQVIsSUFBaUI2Six1QkFBdUJFLE1BQXhDO0FBQ0E3SyxrQkFBVWMsS0FBVixJQUFtQjZKLHVCQUF1QkcsUUFBMUM7O0FBRUF0TSxhQUFLc0IsSUFBTCxDQUFVckYscUJBQXFCZ0YsTUFBckIsQ0FBNEJHLElBQTVCLEVBQWtDLFFBQWxDLENBQVYsRUFBdURDLE9BQXZEO0FBQ0FyQixhQUFLc0IsSUFBTCxDQUFVckYscUJBQXFCZ0YsTUFBckIsQ0FBNEJHLElBQTVCLEVBQWtDLFVBQWxDLENBQVYsRUFBeURJLFNBQXpEO0FBQ0Q7O0FBRUQ7QUFDQSxVQUFJK0ssb0JBQW9CeFEsU0FBVW1RLGdCQUFWLEVBQTRCLENBQTVCLENBQXhCOztBQUVBO0FBQ0VwTyw2QkFBcUJ0QixHQUFHd08sY0FBSCxFQUFyQjtBQUNBak4sNkJBQXFCdkIsR0FBR3lPLGNBQUgsRUFBckI7QUFDQWpOLGtDQUEwQnhCLEdBQUcwTyxtQkFBSCxFQUExQjs7QUFFQTtBQUNBO0FBQ0UsY0FBSXNCLGdCQUFnQmhRLEdBQUdpUCxLQUFILENBQVMsV0FBVCxDQUFwQjtBQUNBLGNBQUl0Tix3QkFBd0JxTyxjQUFjdk4sTUFBMUM7O0FBRUEsY0FBS2QsMEJBQTBCLENBQS9CLEVBQW1DO0FBQ2pDRCw4QkFBa0JzTyxjQUFjLENBQWQsQ0FBbEI7QUFDRDtBQUNGOztBQUVEaFEsV0FBR2dMLElBQUgsQ0FBUSxVQUFSLEVBQW9CcEssUUFBUSxpQkFBWTtBQUN0QyxjQUFLLENBQUNjLGVBQU4sRUFBd0I7QUFDdEI7QUFDRDs7QUFFRDZHO0FBQ0QsU0FORDs7QUFRQXZJLFdBQUdnRSxFQUFILENBQU0sTUFBTixFQUFjLE1BQWQsRUFBc0IzQyxRQUFRLGlCQUFZO0FBQ3hDLGNBQUssQ0FBQ0ssZUFBTixFQUF3QjtBQUN0QjtBQUNEOztBQUVENkc7QUFDRCxTQU5EOztBQVFBdkksV0FBR2dFLEVBQUgsQ0FBTSxPQUFOLEVBQWUsZ0dBQWYsRUFBaUh2RCxTQUFTLGtCQUFZO0FBQ3BJa0kscUJBQVcsWUFBVTtBQUFDSjtBQUFlLFdBQXJDLEVBQXVDLEVBQXZDO0FBQ0QsU0FGRDs7QUFJQXZJLFdBQUdnRSxFQUFILENBQU0sUUFBTixFQUFnQixNQUFoQixFQUF3QnRELFVBQVUsbUJBQVk7QUFDNUMsY0FBSThDLE9BQU8sSUFBWDtBQUNBLGNBQUlBLEtBQUt5TSxRQUFMLEVBQUosRUFBcUI7QUFDbkJ0TyxvQ0FBd0JBLHdCQUF3QixDQUFoRDs7QUFFQTNCLGVBQUdrUSxVQUFIOztBQUVBLGdCQUFJeE8sZUFBSixFQUFxQjtBQUNuQkEsOEJBQWdCeU8sV0FBaEIsQ0FBNEIsMkJBQTVCO0FBQ0Q7O0FBRUQsZ0JBQUl4TywwQkFBMEIsQ0FBOUIsRUFBaUM7QUFDL0Isa0JBQUlxTyxnQkFBZ0JoUSxHQUFHaVAsS0FBSCxDQUFTLFdBQVQsQ0FBcEI7O0FBRUE7QUFDQTtBQUNBLGtCQUFJZSxjQUFjdk4sTUFBZCxLQUF5QixDQUE3QixFQUFnQztBQUM5QmYsa0NBQWtCc08sY0FBYyxDQUFkLENBQWxCO0FBQ0F0TyxnQ0FBZ0IwTyxRQUFoQixDQUF5QiwyQkFBekI7QUFDRCxlQUhELE1BSUs7QUFDSDFPLGtDQUFrQitCLFNBQWxCO0FBQ0Q7QUFDRixhQVpELE1BYUs7QUFDSC9CLGdDQUFrQitCLFNBQWxCO0FBQ0Q7O0FBRUR6RCxlQUFHcVEsUUFBSDtBQUNEO0FBQ0Q5SDtBQUNELFNBL0JEOztBQWlDQ3ZJLFdBQUdnRSxFQUFILENBQU0sS0FBTixFQUFhLE1BQWIsRUFBcUJyRCxPQUFPLGdCQUFZO0FBQ3ZDLGNBQUk2QyxPQUFPLElBQVg7QUFDQSxjQUFJQSxLQUFLeU0sUUFBTCxFQUFKLEVBQXFCO0FBQ25CdE8sb0NBQXdCQSx3QkFBd0IsQ0FBaEQ7O0FBRUEzQixlQUFHa1EsVUFBSDs7QUFFQSxnQkFBSXhPLGVBQUosRUFBcUI7QUFDbkJBLDhCQUFnQnlPLFdBQWhCLENBQTRCLDJCQUE1QjtBQUNEOztBQUVELGdCQUFJeE8sMEJBQTBCLENBQTlCLEVBQWlDO0FBQy9CRCxnQ0FBa0I4QixJQUFsQjtBQUNBOUIsOEJBQWdCME8sUUFBaEIsQ0FBeUIsMkJBQXpCO0FBQ0QsYUFIRCxNQUlLO0FBQ0gxTyxnQ0FBa0IrQixTQUFsQjtBQUNEOztBQUVEekQsZUFBR3FRLFFBQUg7QUFDRDtBQUNEOUg7QUFDRCxTQXRCQTs7QUF3QkR2SSxXQUFHZ0UsRUFBSCxDQUFNLFFBQU4sRUFBZ0IsTUFBaEIsRUFBd0JuRCxVQUFVLG1CQUFZO0FBQzVDLGNBQUkyQyxPQUFPLElBQVg7O0FBRUEsY0FBR0EsS0FBS2MsTUFBTCxHQUFjZ00sY0FBZCxHQUErQjdOLE1BQS9CLElBQXlDLENBQXpDLElBQThDZSxLQUFLK0MsTUFBTCxHQUFjK0osY0FBZCxHQUErQjdOLE1BQS9CLElBQXlDLENBQTFGLEVBQTRGO0FBQzFGO0FBQ0Q7O0FBR0RkLGtDQUF3QkEsd0JBQXdCLENBQWhEOztBQUVBM0IsYUFBR2tRLFVBQUg7O0FBRUEsY0FBSXhPLGVBQUosRUFBcUI7QUFDbkJBLDRCQUFnQnlPLFdBQWhCLENBQTRCLDJCQUE1QjtBQUNEOztBQUVELGNBQUl4TywwQkFBMEIsQ0FBOUIsRUFBaUM7QUFDL0JELDhCQUFrQjhCLElBQWxCO0FBQ0E5Qiw0QkFBZ0IwTyxRQUFoQixDQUF5QiwyQkFBekI7QUFDRCxXQUhELE1BSUs7QUFDSDFPLDhCQUFrQitCLFNBQWxCO0FBQ0Q7O0FBRUR6RCxhQUFHcVEsUUFBSDtBQUNBOUg7QUFDRCxTQTFCRDs7QUE0QkF2SSxXQUFHZ0UsRUFBSCxDQUFNLFVBQU4sRUFBa0IsTUFBbEIsRUFBMEJsRCxZQUFZLHFCQUFZO0FBQ2hEYSxrQ0FBd0JBLHdCQUF3QixDQUFoRDs7QUFFQTNCLGFBQUdrUSxVQUFIOztBQUVBLGNBQUl4TyxlQUFKLEVBQXFCO0FBQ25CQSw0QkFBZ0J5TyxXQUFoQixDQUE0QiwyQkFBNUI7QUFDRDs7QUFFRCxjQUFJeE8sMEJBQTBCLENBQTlCLEVBQWlDO0FBQy9CLGdCQUFJcU8sZ0JBQWdCaFEsR0FBR2lQLEtBQUgsQ0FBUyxXQUFULENBQXBCOztBQUVBO0FBQ0E7QUFDQSxnQkFBSWUsY0FBY3ZOLE1BQWQsS0FBeUIsQ0FBN0IsRUFBZ0M7QUFDOUJmLGdDQUFrQnNPLGNBQWMsQ0FBZCxDQUFsQjtBQUNBdE8sOEJBQWdCME8sUUFBaEIsQ0FBeUIsMkJBQXpCO0FBQ0QsYUFIRCxNQUlLO0FBQ0gxTyxnQ0FBa0IrQixTQUFsQjtBQUNEO0FBQ0YsV0FaRCxNQWFLO0FBQ0gvQiw4QkFBa0IrQixTQUFsQjtBQUNEOztBQUVEekQsYUFBR3FRLFFBQUg7QUFDQTlIO0FBQ0QsU0E1QkQ7O0FBOEJBLFlBQUlnSSxnQkFBSjtBQUNBLFlBQUlDLFdBQUo7QUFDQSxZQUFJQyxTQUFKO0FBQ0EsWUFBSTlMLGVBQUo7QUFDQSxZQUFJK0wsa0JBQUo7QUFDQSxZQUFJQyxhQUFKO0FBQ0EsWUFBSUMsU0FBSjtBQUNBLFlBQUlDLFlBQUo7QUFDQSxZQUFJQyxZQUFKO0FBQ0EsWUFBSUMsc0JBQXNCLEtBQTFCOztBQUVBL1EsV0FBR2dFLEVBQUgsQ0FBTSxVQUFOLEVBQWtCakQsWUFBWSxtQkFBU3FELEtBQVQsRUFBZ0I7QUFDNUNvTSx3QkFBY3BNLE1BQU1vQyxRQUFOLElBQWtCcEMsTUFBTTRNLFVBQXRDO0FBQ0QsU0FGRDs7QUFJQWhSLFdBQUdnRSxFQUFILENBQU0sVUFBTixFQUFrQixNQUFsQixFQUEwQmhELGtCQUFrQix5QkFBVW9ELEtBQVYsRUFBaUI7QUFDM0QsY0FBSVosT0FBTyxJQUFYOztBQUVBLGNBQUksQ0FBQzlCLGVBQUQsSUFBb0JBLGdCQUFnQnFCLEVBQWhCLE9BQXlCUyxLQUFLVCxFQUFMLEVBQWpELEVBQTREO0FBQzFEMk4saUNBQXFCLEtBQXJCO0FBQ0E7QUFDRDs7QUFFREQsc0JBQVlqTixJQUFaOztBQUVBLGNBQUlvQixPQUFPbkYscUJBQXFCd0csV0FBckIsQ0FBaUN6QyxJQUFqQyxDQUFYOztBQUVBO0FBQ0EsY0FBR29CLFNBQVMsTUFBWixFQUNFQSxPQUFPLE1BQVA7O0FBRUYsY0FBSXFNLFNBQVNULFlBQVlySixDQUF6QjtBQUNBLGNBQUkrSixTQUFTVixZQUFZcEosQ0FBekI7O0FBRUE7QUFDQSxjQUFJK0osV0FBV2hELHNCQUFzQjhDLE1BQXRCLEVBQThCQyxNQUE5QixFQUFzQzFOLElBQXRDLENBQWY7O0FBRUEsY0FBRzJOLFlBQVksQ0FBWixJQUFpQkEsWUFBWSxDQUFoQyxFQUFrQztBQUNoQzNOLGlCQUFLZSxRQUFMO0FBQ0FvTSw0QkFBZ0JRLFFBQWhCO0FBQ0FOLDJCQUFnQk0sWUFBWSxDQUFiLEdBQWtCVixVQUFVbEssTUFBVixFQUFsQixHQUF1Q2tLLFVBQVVuTSxNQUFWLEVBQXREOztBQUVBLGdCQUFJOE0sa0JBQW1CRCxZQUFZLENBQWIsR0FBa0IsUUFBbEIsR0FBNkIsUUFBbkQ7QUFDQSxnQkFBSUUsU0FBUzNSLHNCQUFzQjRSLGNBQXRCLENBQXFDYixTQUFyQyxFQUFnRHpRLEVBQWhELEVBQW9Eb0UsTUFBTW1OLGdCQUExRCxFQUE0RUgsZUFBNUUsQ0FBYjs7QUFFQVIsd0JBQVlTLE9BQU9ULFNBQW5CO0FBQ0FILHdCQUFZWSxPQUFPN04sSUFBbkI7O0FBRUEwQjtBQUNELFdBWkQsTUFhSztBQUNIcUwsK0JBQW1COU0sU0FBbkI7QUFDQWlOLGlDQUFxQixJQUFyQjtBQUNEO0FBQ0YsU0F2Q0Q7O0FBeUNBMVEsV0FBR2dFLEVBQUgsQ0FBTSxNQUFOLEVBQWMsTUFBZCxFQUFzQjVDLFFBQVEsaUJBQVk7QUFDeEMsY0FBSU0sZUFBSixFQUFxQjtBQUNuQjZHO0FBQ0Q7QUFDRixTQUpEO0FBS0F2SSxXQUFHZ0UsRUFBSCxDQUFNLFNBQU4sRUFBaUIvQyxXQUFXLGtCQUFVbUQsS0FBVixFQUFpQjtBQUMzQzs7Ozs7QUFLQSxjQUFJcEUsR0FBR2lQLEtBQUgsQ0FBUyxXQUFULEVBQXNCeE0sTUFBdEIsR0FBK0IsQ0FBbkMsRUFBc0M7QUFDcEN6QyxlQUFHcUUsZUFBSCxDQUFtQixLQUFuQjtBQUNEO0FBQ0QsY0FBSWIsT0FBT2lOLFNBQVg7O0FBRUEsY0FBR0EsY0FBY2hOLFNBQWQsSUFBMkJoRSxxQkFBcUJ3SSxhQUFyQixDQUFtQ3pFLElBQW5DLENBQTlCLEVBQXlFO0FBQ3ZFO0FBQ0Q7O0FBRUQsY0FBSW9CLE9BQU9uRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQVg7O0FBRUEsY0FBR2tOLHNCQUFzQnZPLEtBQUtxUCx3QkFBM0IsSUFBdUQsQ0FBQzFQLGFBQXhELElBQXlFOEMsU0FBUyxNQUFyRixFQUE2RjtBQUMzRjtBQUNBLGdCQUFJSixZQUFZL0UscUJBQXFCZ0YsTUFBckIsQ0FBNEJHLElBQTVCLEVBQWtDLFFBQWxDLENBQWhCO0FBQ0EsZ0JBQUlGLGNBQWNqRixxQkFBcUJnRixNQUFyQixDQUE0QkcsSUFBNUIsRUFBa0MsVUFBbEMsQ0FBbEI7O0FBRUFELDhCQUFrQjtBQUNoQm5CLG9CQUFNQSxJQURVO0FBRWhCb0Isb0JBQU1BLElBRlU7QUFHaEJDLHVCQUFTckIsS0FBS3NCLElBQUwsQ0FBVU4sU0FBVixJQUF1QixHQUFHTyxNQUFILENBQVV2QixLQUFLc0IsSUFBTCxDQUFVTixTQUFWLENBQVYsQ0FBdkIsR0FBeUQsRUFIbEQ7QUFJaEJRLHlCQUFXeEIsS0FBS3NCLElBQUwsQ0FBVUosV0FBVixJQUF5QixHQUFHSyxNQUFILENBQVV2QixLQUFLc0IsSUFBTCxDQUFVSixXQUFWLENBQVYsQ0FBekIsR0FBNkQ7QUFKeEQsYUFBbEI7O0FBT0FsQixpQkFBS2UsUUFBTDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBZ00sK0JBQW1COVEscUJBQXFCMEksY0FBckIsQ0FBb0MzRSxJQUFwQyxFQUEwQ2dOLFdBQTFDLENBQW5CO0FBQ0FDLHdCQUFZak4sSUFBWjtBQUNBa04saUNBQXFCak4sU0FBckI7QUFDQXNOLGtDQUFzQixJQUF0QjtBQUNBN0w7QUFDRDs7QUFFRDtBQUNBLGNBQUksQ0FBQ3BELGFBQUQsS0FBbUIyTyxjQUFjaE4sU0FBZCxJQUNwQjhNLHFCQUFxQjlNLFNBQXJCLElBQWtDa04sa0JBQWtCbE4sU0FEbkQsQ0FBSixFQUNvRTtBQUNsRTtBQUNEOztBQUVELGNBQUlnTyxXQUFXck4sTUFBTW9DLFFBQU4sSUFBa0JwQyxNQUFNNE0sVUFBdkM7O0FBRUE7QUFDQSxjQUFHTCxpQkFBaUIsQ0FBQyxDQUFsQixJQUF1QkMsU0FBMUIsRUFBb0M7QUFDbENBLHNCQUFVcEssUUFBVixDQUFtQmlMLFFBQW5CO0FBQ0Q7QUFDRDtBQUhBLGVBSUssSUFBR2xCLG9CQUFvQjlNLFNBQXZCLEVBQWlDO0FBQ3BDc00sZ0NBQWtCdk0sSUFBbEIsRUFBd0JvQixJQUF4QixFQUE4QjJMLGdCQUE5QixFQUFnRGtCLFFBQWhEO0FBQ0Q7QUFDRDtBQUhLLGlCQUlBLElBQUczUCxhQUFILEVBQWlCOztBQUVwQjtBQUNBO0FBQ0E7QUFDQSxvQkFBR3lCLGNBQWNNLGtCQUFkLEtBQXFDSixTQUFyQyxJQUFrRCtNLFdBQXJELEVBQWlFO0FBQy9Eak4sZ0NBQWNNLGtCQUFkLEdBQW1DcUssd0JBQ2pDc0MsWUFBWXJKLENBRHFCLEVBRWpDcUosWUFBWXBKLENBRnFCLEVBR2pDN0QsY0FBY0MsSUFIbUIsQ0FBbkM7QUFJRDs7QUFFRCxvQkFBR0QsY0FBY00sa0JBQWQsS0FBcUNKLFNBQXhDLEVBQWtEO0FBQ2hEc00sb0NBQ0V4TSxjQUFjQyxJQURoQixFQUVFRCxjQUFjRyxRQUZoQixFQUdFSCxjQUFjTSxrQkFIaEIsRUFJRTROLFFBSkY7QUFNRDtBQUNGOztBQUVELGNBQUdyTixNQUFNRSxNQUFOLElBQWdCRixNQUFNRSxNQUFOLENBQWEsQ0FBYixDQUFoQixJQUFtQ0YsTUFBTUUsTUFBTixDQUFhb04sTUFBYixFQUF0QyxFQUE0RDtBQUMxRFosMkJBQWUxTSxNQUFNRSxNQUFyQjtBQUNEO0FBRUYsU0FyRkQ7O0FBdUZBdEUsV0FBR2dFLEVBQUgsQ0FBTSxRQUFOLEVBQWdCOUMsVUFBVSxpQkFBVWtELEtBQVYsRUFBaUI7O0FBRXpDLGNBQUdyQyxRQUFILEVBQVk7QUFDVm9CLG1CQUFPaUMsUUFBUCxHQUFrQnVNLElBQWxCLENBQXVCLGdCQUF2QjtBQUNEOztBQUVELGNBQUluTyxPQUFPaU4sYUFBYWxOLGNBQWNDLElBQXRDOztBQUVBLGNBQUlBLFNBQVNDLFNBQWIsRUFBeUI7QUFDdkIsZ0JBQUlxQyxRQUFRdkMsY0FBY00sa0JBQTFCO0FBQ0EsZ0JBQUlpQyxTQUFTckMsU0FBYixFQUF5QjtBQUN2QixrQkFBSW1PLFNBQVNwTyxLQUFLK0MsTUFBTCxHQUFjQyxRQUFkLENBQXVCLEdBQXZCLENBQWI7QUFDQSxrQkFBSXFMLFNBQVNyTyxLQUFLK0MsTUFBTCxHQUFjQyxRQUFkLENBQXVCLEdBQXZCLENBQWI7QUFDQSxrQkFBSXNMLE9BQU90TyxLQUFLYyxNQUFMLEdBQWNrQyxRQUFkLENBQXVCLEdBQXZCLENBQVg7QUFDQSxrQkFBSXVMLE9BQU92TyxLQUFLYyxNQUFMLEdBQWNrQyxRQUFkLENBQXVCLEdBQXZCLENBQVg7O0FBRUEsa0JBQUlMLGFBQWExRyxxQkFBcUIyRyxpQkFBckIsQ0FBdUM1QyxJQUF2QyxDQUFqQjtBQUNBLGtCQUFJd08sYUFBYSxDQUFDSixNQUFELEVBQVNDLE1BQVQsRUFBaUI5TSxNQUFqQixDQUF3Qm9CLFVBQXhCLEVBQW9DcEIsTUFBcEMsQ0FBMkMsQ0FBQytNLElBQUQsRUFBT0MsSUFBUCxDQUEzQyxDQUFqQjs7QUFFQSxrQkFBSUUsY0FBY25NLFFBQVEsQ0FBMUI7QUFDQSxrQkFBSW9NLFdBQVdELGNBQWMsQ0FBN0I7QUFDQSxrQkFBSUUsV0FBV0YsY0FBYyxDQUE3Qjs7QUFFQSxrQkFBSWxPLFNBQVM7QUFDWG9ELG1CQUFHNkssV0FBVyxJQUFJQyxXQUFmLENBRFE7QUFFWDdLLG1CQUFHNEssV0FBVyxJQUFJQyxXQUFKLEdBQWtCLENBQTdCO0FBRlEsZUFBYjs7QUFLQSxrQkFBSUcsaUJBQWlCO0FBQ25CakwsbUJBQUc2SyxXQUFXLElBQUlFLFFBQWYsQ0FEZ0I7QUFFbkI5SyxtQkFBRzRLLFdBQVcsSUFBSUUsUUFBSixHQUFlLENBQTFCO0FBRmdCLGVBQXJCOztBQUtBLGtCQUFJRyxpQkFBaUI7QUFDbkJsTCxtQkFBRzZLLFdBQVcsSUFBSUcsUUFBZixDQURnQjtBQUVuQi9LLG1CQUFHNEssV0FBVyxJQUFJRyxRQUFKLEdBQWUsQ0FBMUI7QUFGZ0IsZUFBckI7O0FBS0Esa0JBQUlHLFVBQUo7O0FBRUEsa0JBQU12TyxPQUFPb0QsQ0FBUCxLQUFhaUwsZUFBZWpMLENBQTVCLElBQWlDcEQsT0FBT3FELENBQVAsS0FBYWdMLGVBQWVoTCxDQUEvRCxJQUF3RXJELE9BQU9vRCxDQUFQLEtBQWFpTCxlQUFlakwsQ0FBNUIsSUFBaUNwRCxPQUFPcUQsQ0FBUCxLQUFhZ0wsZUFBZWhMLENBQXpJLEVBQStJO0FBQzdJa0wsNkJBQWEsSUFBYjtBQUNELGVBRkQsTUFHSztBQUNILG9CQUFJQyxLQUFLLENBQUVILGVBQWVoTCxDQUFmLEdBQW1CaUwsZUFBZWpMLENBQXBDLEtBQTRDZ0wsZUFBZWpMLENBQWYsR0FBbUJrTCxlQUFlbEwsQ0FBOUUsQ0FBVDtBQUNBLG9CQUFJcUwsS0FBSyxDQUFDLENBQUQsR0FBS0QsRUFBZDs7QUFFQSxvQkFBSUUsMEJBQTBCO0FBQzVCQyw0QkFBVU4sY0FEa0I7QUFFNUJPLDRCQUFVTixjQUZrQjtBQUc1QkUsc0JBQUlBLEVBSHdCO0FBSTVCQyxzQkFBSUE7QUFKd0IsaUJBQTlCOztBQU9BLG9CQUFJSSxzQkFBc0JuVCxxQkFBcUJvVCxlQUFyQixDQUFxQ3JQLElBQXJDLEVBQTJDTyxNQUEzQyxFQUFtRDBPLHVCQUFuRCxDQUExQjtBQUNBLG9CQUFJSyxPQUFPakcsS0FBS0MsSUFBTCxDQUFXRCxLQUFLRSxHQUFMLENBQVdoSixPQUFPb0QsQ0FBUCxHQUFXeUwsb0JBQW9CekwsQ0FBMUMsRUFBOEMsQ0FBOUMsSUFDWjBGLEtBQUtFLEdBQUwsQ0FBV2hKLE9BQU9xRCxDQUFQLEdBQVd3TCxvQkFBb0J4TCxDQUExQyxFQUE4QyxDQUE5QyxDQURDLENBQVg7O0FBR0E7QUFDQSxvQkFBSXhDLE9BQU9uRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQVg7QUFDQSxvQkFBS29CLFNBQVMsTUFBVCxJQUFtQmtPLE9BQVE1UyxVQUFVNlMsc0JBQTFDLEVBQW1FO0FBQ2pFVCwrQkFBYSxJQUFiO0FBQ0Q7QUFFRjs7QUFFRCxrQkFBSUEsVUFBSixFQUNBO0FBQ0U3UyxxQ0FBcUJpSixZQUFyQixDQUFrQ2xGLElBQWxDLEVBQXdDc0MsS0FBeEM7QUFDRDtBQUVGLGFBN0RELE1BOERLLElBQUc4SyxhQUFhbk4sU0FBYixLQUEyQmtOLGlCQUFpQixDQUFqQixJQUFzQkEsaUJBQWlCLENBQWxFLENBQUgsRUFBeUU7O0FBRTVFLGtCQUFJcUMsVUFBVW5DLFlBQWQ7QUFDQSxrQkFBSW9DLFVBQVUsT0FBZDtBQUNBLGtCQUFJQyxXQUFZdkMsaUJBQWlCLENBQWxCLEdBQXVCLFFBQXZCLEdBQWtDLFFBQWpEOztBQUVBO0FBQ0Esa0JBQUdHLFlBQUgsRUFBZ0I7QUFDZCxvQkFBSXFDLFlBQWF4QyxpQkFBaUIsQ0FBbEIsR0FBdUJHLFlBQXZCLEdBQXNDdE4sS0FBSytDLE1BQUwsRUFBdEQ7QUFDQSxvQkFBSTZNLFlBQWF6QyxpQkFBaUIsQ0FBbEIsR0FBdUJHLFlBQXZCLEdBQXNDdE4sS0FBS2MsTUFBTCxFQUF0RDtBQUNBLG9CQUFHLE9BQU95RSxZQUFQLEtBQXdCLFVBQTNCLEVBQ0VrSyxVQUFVbEssYUFBYXZGLElBQWIsRUFBbUIyUCxTQUFuQixFQUE4QkMsU0FBOUIsQ0FBVjtBQUNGSiwwQkFBV0MsWUFBWSxPQUFiLEdBQXdCbkMsWUFBeEIsR0FBdUNELFlBQWpEO0FBQ0Q7O0FBRUQsa0JBQUlzQyxZQUFheEMsaUJBQWlCLENBQWxCLEdBQXVCcUMsT0FBdkIsR0FBaUN4UCxLQUFLK0MsTUFBTCxFQUFqRDtBQUNBLGtCQUFJNk0sWUFBYXpDLGlCQUFpQixDQUFsQixHQUF1QnFDLE9BQXZCLEdBQWlDeFAsS0FBS2MsTUFBTCxFQUFqRDtBQUNBZCxxQkFBTzlELHNCQUFzQjJULFdBQXRCLENBQWtDN1AsSUFBbEMsRUFBd0NxTixZQUF4QyxFQUFzRHFDLFFBQXRELENBQVA7O0FBRUEsa0JBQUdyQyxhQUFhOU4sRUFBYixPQUFzQmlRLFFBQVFqUSxFQUFSLEVBQXpCLEVBQXNDO0FBQ3BDO0FBQ0Esb0JBQUcsT0FBTytGLG1CQUFQLEtBQStCLFVBQWxDLEVBQTZDO0FBQzNDLHNCQUFJd0ssa0JBQWtCeEssb0JBQW9CcUssVUFBVXBRLEVBQVYsRUFBcEIsRUFBb0NxUSxVQUFVclEsRUFBVixFQUFwQyxFQUFvRFMsS0FBS3NCLElBQUwsRUFBcEQsQ0FBdEI7O0FBRUEsc0JBQUd3TyxlQUFILEVBQW1CO0FBQ2pCNVQsMENBQXNCNlQsUUFBdEIsQ0FBK0IvUCxJQUEvQixFQUFxQzhQLGVBQXJDO0FBQ0E3VCx5Q0FBcUI2UCxnQkFBckIsQ0FBc0NwUCxVQUFVcVAscUJBQWhELEVBQzBCclAsVUFBVXNQLHdCQURwQyxFQUM4RCxDQUFDOEQsZUFBRCxDQUQ5RDtBQUVEOztBQUVELHNCQUFHQSxtQkFBbUJwVCxVQUFVa0ksUUFBaEMsRUFBeUM7QUFDdkMsd0JBQUlySSxTQUFTO0FBQ1h5VCwrQkFBU0YsZUFERTtBQUVYRywrQkFBU2pRO0FBRkUscUJBQWI7QUFJQXhELHVCQUFHcUksUUFBSCxHQUFjQyxFQUFkLENBQWlCLHVCQUFqQixFQUEwQ3ZJLE1BQTFDO0FBQ0F5RCwyQkFBTzhQLGVBQVA7QUFDRCxtQkFQRCxNQVFLLElBQUdBLGVBQUgsRUFBbUI7QUFDdEJ0VCx1QkFBRzBULE1BQUgsQ0FBVWxRLElBQVY7QUFDQUEsMkJBQU84UCxlQUFQO0FBQ0Q7QUFDRixpQkFyQkQsTUFzQkk7QUFDRixzQkFBSUssTUFBT2hELGlCQUFpQixDQUFsQixHQUF1QixFQUFDcEssUUFBUXlNLFFBQVFqUSxFQUFSLEVBQVQsRUFBdkIsR0FBZ0QsRUFBQ3VCLFFBQVEwTyxRQUFRalEsRUFBUixFQUFULEVBQTFEO0FBQ0Esc0JBQUk2USxTQUFVakQsaUJBQWlCLENBQWxCLEdBQXVCLEVBQUNwSyxRQUFRc0ssYUFBYTlOLEVBQWIsRUFBVCxFQUF2QixHQUFxRCxFQUFDdUIsUUFBUXVNLGFBQWE5TixFQUFiLEVBQVQsRUFBbEU7O0FBRUEsc0JBQUc3QyxVQUFVa0ksUUFBVixJQUFzQjRLLFFBQVFqUSxFQUFSLE9BQWlCOE4sYUFBYTlOLEVBQWIsRUFBMUMsRUFBNkQ7QUFDM0Qsd0JBQUltRixRQUFRO0FBQ1YxRSw0QkFBTUEsSUFESTtBQUVWMFAsZ0NBQVVTLEdBRkE7QUFHVkMsOEJBQVFBO0FBSEUscUJBQVo7QUFLQSx3QkFBSXZDLFNBQVNyUixHQUFHcUksUUFBSCxHQUFjQyxFQUFkLENBQWlCLGVBQWpCLEVBQWtDSixLQUFsQyxDQUFiO0FBQ0ExRSwyQkFBTzZOLE9BQU83TixJQUFkO0FBQ0E7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQ7QUFDQSxrQkFBR3lQLFlBQVksT0FBWixJQUF1QixPQUFPakssNkJBQVAsS0FBeUMsVUFBbkUsRUFBOEU7QUFDNUVBO0FBQ0Q7QUFDRHhGLG1CQUFLK0IsTUFBTDtBQUNBdkYsaUJBQUcwVCxNQUFILENBQVU5QyxTQUFWO0FBQ0Q7QUFDRjtBQUNELGNBQUloTSxPQUFPbkYscUJBQXFCd0csV0FBckIsQ0FBaUN6QyxJQUFqQyxDQUFYOztBQUVBO0FBQ0EsY0FBR29CLFNBQVMsTUFBWixFQUFtQjtBQUNqQkEsbUJBQU8sTUFBUDtBQUNEOztBQUVELGNBQUdyQixjQUFjTSxrQkFBZCxLQUFxQ0osU0FBckMsSUFBa0QsQ0FBQ3NOLG1CQUF0RCxFQUEwRTtBQUN4RXBNLDhCQUFrQmxCLFNBQWxCO0FBQ0Q7O0FBRUQsY0FBSWUsWUFBWS9FLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxRQUFsQyxDQUFoQjtBQUNBLGNBQUlwQixTQUFTQyxTQUFULElBQXNCa0Isb0JBQW9CbEIsU0FBMUMsSUFDRixDQUFDRCxLQUFLc0IsSUFBTCxDQUFVTixTQUFWLElBQXVCaEIsS0FBS3NCLElBQUwsQ0FBVU4sU0FBVixFQUFxQnFQLFFBQXJCLEVBQXZCLEdBQXlELElBQTFELEtBQW1FbFAsZ0JBQWdCRSxPQUFoQixDQUF3QmdQLFFBQXhCLEVBRHJFLEVBQ3lHOztBQUV2RztBQUNBLGdCQUFHOUMsbUJBQUgsRUFBdUI7QUFDdkJ2TixtQkFBSytCLE1BQUw7O0FBRUE7QUFDQXZGLGlCQUFHcUUsZUFBSCxDQUFtQixJQUFuQjtBQUNDOztBQUVELGdCQUFHbkUsVUFBVWtJLFFBQWIsRUFBdUI7QUFDckJwSSxpQkFBR3FJLFFBQUgsR0FBY0MsRUFBZCxDQUFpQixvQkFBakIsRUFBdUMzRCxlQUF2QztBQUNEO0FBQ0Y7O0FBRUQ0TCw2QkFBbUI5TSxTQUFuQjtBQUNBZ04sc0JBQVloTixTQUFaO0FBQ0FrQiw0QkFBa0JsQixTQUFsQjtBQUNBaU4sK0JBQXFCak4sU0FBckI7QUFDQWtOLDBCQUFnQmxOLFNBQWhCO0FBQ0FtTixzQkFBWW5OLFNBQVo7QUFDQW9OLHlCQUFlcE4sU0FBZjtBQUNBcU4seUJBQWVyTixTQUFmO0FBQ0ErTSx3QkFBYy9NLFNBQWQ7QUFDQXNOLGdDQUFzQixLQUF0Qjs7QUFFQXhOLHdCQUFjTSxrQkFBZCxHQUFtQ0osU0FBbkM7O0FBRUFnQztBQUNBa0QscUJBQVcsWUFBVTtBQUFDSjtBQUFlLFdBQXJDLEVBQXVDLEVBQXZDO0FBQ0QsU0F2TEQ7O0FBeUxBO0FBQ0EsWUFBSXVMLGVBQUo7QUFDQSxZQUFJQyxXQUFKO0FBQ0EsWUFBSUMseUJBQUo7QUFDQSxZQUFJQyxxQkFBSjtBQUNBalUsV0FBR2dFLEVBQUgsQ0FBTSx1QkFBTixFQUErQixVQUFVa1EsQ0FBVixFQUFhakYsS0FBYixFQUFvQjtBQUMvQ2dGLGtDQUF3QixLQUF4QjtBQUNBLGNBQUloRixNQUFNLENBQU4sS0FBWXhMLFNBQWhCLEVBQ0E7QUFDSXdMLGtCQUFNcEosT0FBTixDQUFjLFVBQVVyQyxJQUFWLEVBQWdCO0FBQzVCLGtCQUFJL0QscUJBQXFCMkcsaUJBQXJCLENBQXVDNUMsSUFBdkMsS0FBZ0RDLFNBQWhELElBQTZELENBQUN3USxxQkFBbEUsRUFDQTtBQUNJRiw4QkFBYyxFQUFFNU0sR0FBRzFILHFCQUFxQjJHLGlCQUFyQixDQUF1QzVDLElBQXZDLEVBQTZDLENBQTdDLENBQUwsRUFBc0Q0RCxHQUFHM0gscUJBQXFCMkcsaUJBQXJCLENBQXVDNUMsSUFBdkMsRUFBNkMsQ0FBN0MsQ0FBekQsRUFBZDtBQUNBc1Esa0NBQWtCO0FBQ2RLLDZCQUFXLElBREc7QUFFZEMsdUNBQXFCO0FBQ2pCak4sdUJBQUc0TSxZQUFZNU0sQ0FERTtBQUVqQkMsdUJBQUcyTSxZQUFZM007QUFGRSxtQkFGUDtBQU1kNkgseUJBQU9BO0FBTk8saUJBQWxCO0FBUUErRSw0Q0FBNEJ4USxJQUE1QjtBQUNBeVEsd0NBQXdCLElBQXhCO0FBQ0g7QUFDRixhQWZEO0FBZ0JIO0FBQ0osU0FyQkQ7O0FBdUJBalUsV0FBR2dFLEVBQUgsQ0FBTSxxQkFBTixFQUE2QixVQUFVa1EsQ0FBVixFQUFhakYsS0FBYixFQUFvQjtBQUM3QyxjQUFJNkUsbUJBQW1CclEsU0FBdkIsRUFDQTtBQUNJLGdCQUFJNFEsYUFBYVAsZ0JBQWdCTSxtQkFBakM7QUFDQSxnQkFBSUUsbUJBQW1CO0FBQ25Cbk4saUJBQUcxSCxxQkFBcUIyRyxpQkFBckIsQ0FBdUM0Tix5QkFBdkMsRUFBa0UsQ0FBbEUsQ0FEZ0I7QUFFbkI1TSxpQkFBRzNILHFCQUFxQjJHLGlCQUFyQixDQUF1QzROLHlCQUF2QyxFQUFrRSxDQUFsRTtBQUZnQixhQUF2Qjs7QUFNQUYsNEJBQWdCOUUsWUFBaEIsR0FBK0I7QUFDM0I3SCxpQkFBRyxDQUFDbU4saUJBQWlCbk4sQ0FBbEIsR0FBc0JrTixXQUFXbE4sQ0FEVDtBQUUzQkMsaUJBQUcsQ0FBQ2tOLGlCQUFpQmxOLENBQWxCLEdBQXNCaU4sV0FBV2pOO0FBRlQsYUFBL0I7O0FBS0EsbUJBQU8wTSxnQkFBZ0JNLG1CQUF2Qjs7QUFFQSxnQkFBR2xVLFVBQVVrSSxRQUFiLEVBQXVCO0FBQ25CcEksaUJBQUdxSSxRQUFILEdBQWNDLEVBQWQsQ0FBaUIsa0JBQWpCLEVBQXFDd0wsZUFBckM7QUFDSDs7QUFFREEsOEJBQWtCclEsU0FBbEI7QUFDSDtBQUNKLFNBdkJEOztBQXlCQXpELFdBQUdnRSxFQUFILENBQU0sUUFBTixFQUFnQjdDLFVBQVUsaUJBQVVpRCxLQUFWLEVBQWlCO0FBQ3pDLGNBQUlFLFNBQVNGLE1BQU1FLE1BQU4sSUFBZ0JGLE1BQU00RCxRQUFuQztBQUNBLGNBQUl1TSxlQUFlLEtBQW5COztBQUVBLGNBQUc7QUFDREEsMkJBQWVqUSxPQUFPa1EsTUFBUCxFQUFmO0FBQ0QsV0FGRCxDQUdBLE9BQU1DLEdBQU4sRUFBVTtBQUNSO0FBQ0Q7O0FBRUQsY0FBSWpSLElBQUosRUFBVW9CLElBQVY7QUFDQSxjQUFHMlAsWUFBSCxFQUFnQjtBQUNkL1EsbUJBQU9jLE1BQVA7QUFDQU0sbUJBQU9uRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQVA7QUFDRCxXQUhELE1BSUk7QUFDRkEsbUJBQU9ELGNBQWNDLElBQXJCO0FBQ0FvQixtQkFBT3JCLGNBQWNHLFFBQXJCO0FBQ0Q7O0FBRUQsY0FBSXNHLFFBQVFoSyxHQUFHK0osWUFBSCxDQUFnQixLQUFoQixDQUFaLENBckJ5QyxDQXFCTDs7QUFFcEMsY0FBRyxDQUFDckksZUFBRCxJQUFvQkEsZ0JBQWdCcUIsRUFBaEIsTUFBd0JTLEtBQUtULEVBQUwsRUFBNUMsSUFBeUR0RCxxQkFBcUJ3SSxhQUFyQixDQUFtQ3pFLElBQW5DLENBQXpELElBQ0M5QixvQkFBb0I4QixJQUR4QixFQUM4QjtBQUM1QndHLGtCQUFNMEssWUFBTixDQUFtQnRVLHdCQUFuQjtBQUNBNEosa0JBQU0wSyxZQUFOLENBQW1CdlUscUJBQW5CO0FBQ0E2SixrQkFBTTBLLFlBQU4sQ0FBbUJuVSwyQkFBbkI7QUFDQXlKLGtCQUFNMEssWUFBTixDQUFtQnBVLHdCQUFuQjtBQUNBO0FBQ0Q7O0FBRUQsY0FBSXFVLFFBQVF2USxNQUFNb0MsUUFBTixJQUFrQnBDLE1BQU00TSxVQUFwQztBQUNBLGNBQUk0RCxnQkFBZ0IxRyx3QkFBd0J5RyxNQUFNeE4sQ0FBOUIsRUFBaUN3TixNQUFNdk4sQ0FBdkMsRUFBMEM1RCxJQUExQyxDQUFwQjtBQUNBO0FBQ0EsY0FBSW9SLGlCQUFpQixDQUFDLENBQXRCLEVBQXlCO0FBQ3ZCNUssa0JBQU0wSyxZQUFOLENBQW1CdFUsd0JBQW5CO0FBQ0E0SixrQkFBTTBLLFlBQU4sQ0FBbUJuVSwyQkFBbkI7QUFDQSxnQkFBR3FFLFNBQVMsU0FBVCxJQUFzQjJQLFlBQXpCLEVBQXNDO0FBQ3BDdkssb0JBQU02SyxZQUFOLENBQW1CdlUsd0JBQW5CO0FBQ0EwSixvQkFBTTBLLFlBQU4sQ0FBbUJ2VSxxQkFBbkI7QUFDRCxhQUhELE1BSUssSUFBR3lFLFNBQVMsTUFBVCxJQUFtQjJQLFlBQXRCLEVBQW1DO0FBQ3RDdkssb0JBQU02SyxZQUFOLENBQW1CMVUscUJBQW5CO0FBQ0E2SixvQkFBTTBLLFlBQU4sQ0FBbUJwVSx3QkFBbkI7QUFDRCxhQUhJLE1BSUEsSUFBSWlVLFlBQUosRUFBaUI7QUFDcEJ2SyxvQkFBTTZLLFlBQU4sQ0FBbUIxVSxxQkFBbkI7QUFDQTZKLG9CQUFNNkssWUFBTixDQUFtQnZVLHdCQUFuQjtBQUNELGFBSEksTUFJQTtBQUNIMEosb0JBQU0wSyxZQUFOLENBQW1CdlUscUJBQW5CO0FBQ0E2SixvQkFBTTBLLFlBQU4sQ0FBbUJwVSx3QkFBbkI7QUFDRDtBQUNEYixpQ0FBcUJxVixhQUFyQixHQUFxQ0gsS0FBckM7QUFDRDtBQUNEO0FBckJBLGVBc0JLO0FBQ0gzSyxvQkFBTTBLLFlBQU4sQ0FBbUJ2VSxxQkFBbkI7QUFDQTZKLG9CQUFNMEssWUFBTixDQUFtQnBVLHdCQUFuQjtBQUNBLGtCQUFHc0UsU0FBUyxTQUFaLEVBQXNCO0FBQ3BCb0Ysc0JBQU02SyxZQUFOLENBQW1CdFUsMkJBQW5CO0FBQ0F5SixzQkFBTTBLLFlBQU4sQ0FBbUJ0VSx3QkFBbkI7QUFDQSxvQkFBSStCLEtBQUt1SCxpQ0FBTCxJQUNBbEcsS0FBSzBDLFFBQUwsQ0FBYyw2Q0FBZCxDQURKLEVBQ2tFO0FBQ2hFOEQsd0JBQU02SyxZQUFOLENBQW1CclUsOEJBQW5CO0FBQ0Q7QUFDRixlQVBELE1BUUssSUFBR29FLFNBQVMsTUFBWixFQUFtQjtBQUN0Qm9GLHNCQUFNNkssWUFBTixDQUFtQnpVLHdCQUFuQjtBQUNBNEosc0JBQU0wSyxZQUFOLENBQW1CblUsMkJBQW5CO0FBQ0QsZUFISSxNQUlEO0FBQ0Z5SixzQkFBTTBLLFlBQU4sQ0FBbUJ0VSx3QkFBbkI7QUFDQTRKLHNCQUFNMEssWUFBTixDQUFtQm5VLDJCQUFuQjtBQUNBeUosc0JBQU0wSyxZQUFOLENBQW1CbFUsOEJBQW5CO0FBQ0Q7QUFDRGYsbUNBQXFCc1Ysa0JBQXJCLEdBQTBDSCxhQUExQztBQUNEOztBQUVEblYsK0JBQXFCdVYsY0FBckIsR0FBc0N4UixJQUF0QztBQUNELFNBakZEOztBQW1GQXhELFdBQUdnRSxFQUFILENBQU0sa0NBQU4sRUFBMEMsTUFBMUMsRUFBa0QsWUFBVztBQUMzRCxjQUFJUixPQUFPLElBQVg7QUFDQXhELGFBQUdrUSxVQUFIO0FBQ0FsUSxhQUFHaVAsS0FBSCxHQUFXMUssUUFBWDs7QUFFQTtBQUNBO0FBQ0F2RSxhQUFHeVAsT0FBSCxDQUFXLG1CQUFYOztBQUVBelAsYUFBR3FRLFFBQUg7QUFDQTlIO0FBR0QsU0FiRDtBQWNEOztBQUVELFVBQUl5SCxhQUFKO0FBQ0EsVUFBSWlGLGdCQUFnQixLQUFwQjs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxVQUFJQyxPQUFPO0FBQ1QsY0FBTSxLQURHO0FBRVQsY0FBTSxLQUZHO0FBR1QsY0FBTSxLQUhHO0FBSVQsY0FBTTtBQUpHLE9BQVg7O0FBT0EsZUFBU0MsT0FBVCxDQUFpQmpCLENBQWpCLEVBQW9COztBQUVoQixZQUFJa0IsYUFBYSxPQUFPbFYsVUFBVW1WLDhCQUFqQixLQUFvRCxVQUFwRCxHQUNYblYsVUFBVW1WLDhCQUFWLEVBRFcsR0FDa0NuVixVQUFVbVYsOEJBRDdEOztBQUdBLFlBQUksQ0FBQ0QsVUFBTCxFQUFpQjtBQUNiO0FBQ0g7O0FBRUQ7QUFDQSxZQUFJRSxLQUFLQyxTQUFTQyxhQUFULENBQXVCQyxPQUFoQztBQUNBLFlBQUlILE1BQU0sVUFBTixJQUFvQkEsTUFBTSxPQUE5QixFQUNBO0FBQ0ksa0JBQU9wQixFQUFFd0IsT0FBVDtBQUNJLGlCQUFLLEVBQUwsQ0FBUyxLQUFLLEVBQUwsQ0FBUyxLQUFLLEVBQUwsQ0FBVSxLQUFLLEVBQUwsQ0FEaEMsQ0FDeUM7QUFDckMsaUJBQUssRUFBTDtBQUFTeEIsZ0JBQUV5QixjQUFGLEdBQW9CLE1BRmpDLENBRXdDO0FBQ3BDO0FBQVMsb0JBSGIsQ0FHb0I7QUFIcEI7QUFLQSxjQUFJekIsRUFBRXdCLE9BQUYsR0FBWSxJQUFaLElBQW9CeEIsRUFBRXdCLE9BQUYsR0FBWSxJQUFwQyxFQUEwQztBQUN0QztBQUNIO0FBQ0RSLGVBQUtoQixFQUFFd0IsT0FBUCxJQUFrQixJQUFsQjs7QUFFQTtBQUNBO0FBQ0EsY0FBSTFWLEdBQUdpUCxLQUFILENBQVMsV0FBVCxFQUFzQnhNLE1BQXRCLElBQWdDekMsR0FBRzRWLFFBQUgsQ0FBWSxXQUFaLEVBQXlCblQsTUFBekQsSUFBbUV6QyxHQUFHaVAsS0FBSCxDQUFTLFdBQVQsRUFBc0J4TSxNQUF0QixJQUFnQyxDQUF2RyxFQUNBO0FBQ0U7QUFDRDtBQUNELGNBQUksQ0FBQ3dTLGFBQUwsRUFDQTtBQUNJakYsNEJBQWdCaFEsR0FBR2lQLEtBQUgsQ0FBUyxXQUFULENBQWhCO0FBQ0FqUCxlQUFHeVAsT0FBSCxDQUFXLHVCQUFYLEVBQW9DLENBQUNPLGFBQUQsQ0FBcEM7QUFDQWlGLDRCQUFnQixJQUFoQjtBQUNIO0FBQ0QsY0FBSVksWUFBWSxDQUFoQjs7QUFFQTtBQUNBLGNBQUczQixFQUFFNEIsTUFBRixJQUFZNUIsRUFBRTZCLFFBQWpCLEVBQTJCO0FBQ3pCO0FBQ0QsV0FGRCxNQUdLLElBQUk3QixFQUFFNEIsTUFBTixFQUFjO0FBQ2pCRCx3QkFBWSxDQUFaO0FBQ0QsV0FGSSxNQUdBLElBQUkzQixFQUFFNkIsUUFBTixFQUFnQjtBQUNuQkYsd0JBQVksRUFBWjtBQUNEOztBQUVELGNBQUlHLGNBQWMsRUFBbEI7QUFDQSxjQUFJQyxnQkFBZ0IsRUFBcEI7QUFDQSxjQUFJQyxnQkFBZ0IsRUFBcEI7QUFDQSxjQUFJQyxpQkFBaUIsRUFBckI7O0FBRUEsY0FBSUMsS0FBSyxDQUFUO0FBQ0EsY0FBSUMsS0FBSyxDQUFUOztBQUVBRCxnQkFBTWxCLEtBQUtpQixjQUFMLElBQXVCTixTQUF2QixHQUFtQyxDQUF6QztBQUNBTyxnQkFBTWxCLEtBQUtnQixhQUFMLElBQXNCTCxTQUF0QixHQUFrQyxDQUF4QztBQUNBUSxnQkFBTW5CLEtBQUtlLGFBQUwsSUFBc0JKLFNBQXRCLEdBQWtDLENBQXhDO0FBQ0FRLGdCQUFNbkIsS0FBS2MsV0FBTCxJQUFvQkgsU0FBcEIsR0FBZ0MsQ0FBdEM7O0FBRUE5RywyQkFBaUIsRUFBQzVILEdBQUVpUCxFQUFILEVBQU9oUCxHQUFFaVAsRUFBVCxFQUFqQixFQUErQnJHLGFBQS9CO0FBQ0g7QUFDSjtBQUNELGVBQVNzRyxLQUFULENBQWVwQyxDQUFmLEVBQWtCOztBQUVkLFlBQUlBLEVBQUV3QixPQUFGLEdBQVksSUFBWixJQUFvQnhCLEVBQUV3QixPQUFGLEdBQVksSUFBcEMsRUFBMEM7QUFDdEM7QUFDSDtBQUNEeEIsVUFBRXlCLGNBQUY7QUFDQVQsYUFBS2hCLEVBQUV3QixPQUFQLElBQWtCLEtBQWxCO0FBQ0EsWUFBSU4sYUFBYSxPQUFPbFYsVUFBVW1WLDhCQUFqQixLQUFvRCxVQUFwRCxHQUNYblYsVUFBVW1WLDhCQUFWLEVBRFcsR0FDa0NuVixVQUFVbVYsOEJBRDdEOztBQUdBLFlBQUksQ0FBQ0QsVUFBTCxFQUFpQjtBQUNiO0FBQ0g7O0FBRURwVixXQUFHeVAsT0FBSCxDQUFXLHFCQUFYLEVBQWtDLENBQUNPLGFBQUQsQ0FBbEM7QUFDQUEsd0JBQWdCdk0sU0FBaEI7QUFDQXdSLHdCQUFnQixLQUFoQjtBQUVIO0FBQ0RNLGVBQVNnQixnQkFBVCxDQUEwQixTQUExQixFQUFvQ3BCLE9BQXBDLEVBQTZDLElBQTdDO0FBQ0FJLGVBQVNnQixnQkFBVCxDQUEwQixPQUExQixFQUFrQ0QsS0FBbEMsRUFBeUMsSUFBekM7O0FBRUFsVSxpQkFBVzBDLElBQVgsQ0FBZ0IsZUFBaEIsRUFBaUNBLElBQWpDO0FBQ0QsS0FqOENhO0FBazhDZDBSLFlBQVEsa0JBQVk7QUFDaEJ4VyxTQUFHbUUsR0FBSCxDQUFPLFFBQVAsRUFBaUIsTUFBakIsRUFBeUJ6RCxPQUF6QixFQUNHeUQsR0FESCxDQUNPLEtBRFAsRUFDYyxNQURkLEVBQ3NCeEQsSUFEdEIsRUFFR3dELEdBRkgsQ0FFTyxPQUZQLEVBRWdCLGdHQUZoQixFQUVrSDFELE1BRmxILEVBR0cwRCxHQUhILENBR08sUUFIUCxFQUdpQixNQUhqQixFQUd5QnRELE9BSHpCLEVBSUdzRCxHQUpILENBSU8sVUFKUCxFQUltQixNQUpuQixFQUkyQnJELFNBSjNCLEVBS0dxRCxHQUxILENBS08sVUFMUCxFQUttQnBELFNBTG5CLEVBTUdvRCxHQU5ILENBTU8sVUFOUCxFQU1tQixNQU5uQixFQU0yQm5ELGVBTjNCLEVBT0dtRCxHQVBILENBT08sU0FQUCxFQU9rQmxELFFBUGxCLEVBUUdrRCxHQVJILENBUU8sUUFSUCxFQVFpQmpELE9BUmpCLEVBU0dpRCxHQVRILENBU08sUUFUUCxFQVNpQmhELE9BVGpCLEVBVUdnRCxHQVZILENBVU8sTUFWUCxFQVVlLE1BVmYsRUFVc0IvQyxLQVZ0QixFQVdHK0MsR0FYSCxDQVdPLE1BWFAsRUFXZSxNQVhmLEVBV3VCOUMsS0FYdkI7O0FBYUFyQixTQUFHd1csTUFBSCxDQUFVLFVBQVYsRUFBc0I1VixLQUF0QjtBQUNIO0FBajlDYSxHQUFoQjs7QUFvOUNBLE1BQUlvQixVQUFVL0IsRUFBVixDQUFKLEVBQW1CO0FBQ2pCLFdBQU8rQixVQUFVL0IsRUFBVixFQUFjd1csS0FBZCxDQUFvQnBVLEVBQUVyQyxHQUFHZ0QsU0FBSCxFQUFGLENBQXBCLEVBQXVDMFQsTUFBTUMsU0FBTixDQUFnQkMsS0FBaEIsQ0FBc0JDLElBQXRCLENBQTJCQyxTQUEzQixFQUFzQyxDQUF0QyxDQUF2QyxDQUFQO0FBQ0QsR0FGRCxNQUVPLElBQUksUUFBTzdXLEVBQVAseUNBQU9BLEVBQVAsTUFBYSxRQUFiLElBQXlCLENBQUNBLEVBQTlCLEVBQWtDO0FBQ3ZDLFdBQU8rQixVQUFVQyxJQUFWLENBQWV3VSxLQUFmLENBQXFCcFUsRUFBRXJDLEdBQUdnRCxTQUFILEVBQUYsQ0FBckIsRUFBd0M4VCxTQUF4QyxDQUFQO0FBQ0QsR0FGTSxNQUVBO0FBQ0x6VSxNQUFFMFUsS0FBRixDQUFRLHVCQUF1QjlXLEVBQXZCLEdBQTRCLGlDQUFwQztBQUNEOztBQUVELFNBQU9vQyxFQUFFLElBQUYsQ0FBUDtBQUNELENBdC9DRCxDOzs7Ozs7Ozs7QUNOQSxJQUFJNUMsdUJBQXVCO0FBQ3pCUyxXQUFTdUQsU0FEZ0I7QUFFekJ1UixrQkFBZ0J2UixTQUZTO0FBR3pCcVIsaUJBQWVyUixTQUhVO0FBSXpCc1Isc0JBQW9CdFIsU0FKSztBQUt6QnVULGtCQUFnQnZULFNBTFM7QUFNekJ3VCxxQkFBbUIsMkJBQVNDLGVBQVQsRUFBMEI7QUFDM0MsU0FBS0YsY0FBTCxHQUFzQkUsZUFBdEI7QUFDRCxHQVJ3QjtBQVN6QnpTLFVBQVE7QUFDTjBTLFVBQU07QUFDSjNULFlBQU0sVUFERjtBQUVKNFQsYUFBTywrQkFGSDtBQUdKQyxrQkFBWSx1Q0FIUjtBQUlKeEgsY0FBUSwwQkFKSjtBQUtKQyxnQkFBVSw0QkFMTjtBQU1Kd0gsaUJBQVcsaUJBTlA7QUFPSkMsbUJBQWE7QUFQVCxLQURBO0FBVU5DLGFBQVM7QUFDUGhVLFlBQU0sa0JBREM7QUFFUDRULGFBQU8scUNBRkE7QUFHUEMsa0JBQVksNkNBSEw7QUFJUHhILGNBQVEsNkJBSkQ7QUFLUEMsZ0JBQVUsK0JBTEg7QUFNUHdILGlCQUFXLHVCQU5KO0FBT1BDLG1CQUFhO0FBUE47QUFWSCxHQVRpQjtBQTZCekI7QUFDQTtBQUNBO0FBQ0F0UixlQUFhLHFCQUFTekMsSUFBVCxFQUFjO0FBQ3pCLFFBQUcsQ0FBQ0EsSUFBSixFQUNFLE9BQU8sTUFBUCxDQURGLEtBRUssSUFBR0EsS0FBSzBDLFFBQUwsQ0FBYyxLQUFLekIsTUFBTCxDQUFZLE1BQVosRUFBb0IsT0FBcEIsQ0FBZCxDQUFILEVBQ0gsT0FBTyxNQUFQLENBREcsS0FFQSxJQUFHakIsS0FBSzBDLFFBQUwsQ0FBYyxLQUFLekIsTUFBTCxDQUFZLFNBQVosRUFBdUIsT0FBdkIsQ0FBZCxDQUFILEVBQ0gsT0FBTyxTQUFQLENBREcsS0FFQSxJQUFHakIsS0FBSzZHLEdBQUwsQ0FBUyxhQUFULE1BQTRCLEtBQUs1RixNQUFMLENBQVksTUFBWixFQUFvQixNQUFwQixDQUEvQixFQUNILE9BQU8sTUFBUCxDQURHLEtBRUEsSUFBR2pCLEtBQUs2RyxHQUFMLENBQVMsYUFBVCxNQUE0QixLQUFLNUYsTUFBTCxDQUFZLFNBQVosRUFBdUIsTUFBdkIsQ0FBL0IsRUFDSCxPQUFPLFNBQVAsQ0FERyxLQUVBLElBQUcsS0FBS3ZFLE9BQUwsQ0FBYXFQLHFCQUFiLENBQW1DL0wsSUFBbkMsS0FDQSxLQUFLdEQsT0FBTCxDQUFhcVAscUJBQWIsQ0FBbUMvTCxJQUFuQyxFQUF5Q2YsTUFBekMsR0FBa0QsQ0FEckQsRUFFSCxPQUFPLE1BQVAsQ0FGRyxLQUdBLElBQUcsS0FBS3ZDLE9BQUwsQ0FBYXNQLHdCQUFiLENBQXNDaE0sSUFBdEMsS0FDQSxLQUFLdEQsT0FBTCxDQUFhc1Asd0JBQWIsQ0FBc0NoTSxJQUF0QyxFQUE0Q2YsTUFBNUMsR0FBcUQsQ0FEeEQsRUFFSCxPQUFPLFNBQVA7QUFDRixXQUFPLE1BQVA7QUFDRCxHQWxEd0I7QUFtRHpCO0FBQ0E2TSxvQkFBa0IsMEJBQVNtSSxnQkFBVCxFQUEyQkMsbUJBQTNCLEVBQWdEekksS0FBaEQsRUFBdUQ7QUFDdkUsU0FBSyxJQUFJdkksSUFBSSxDQUFiLEVBQWdCQSxJQUFJdUksTUFBTXhNLE1BQTFCLEVBQWtDaUUsR0FBbEMsRUFBdUM7QUFDckMsVUFBSWxELE9BQU95TCxNQUFNdkksQ0FBTixDQUFYO0FBQ0EsVUFBSTlCLE9BQU8sS0FBS3FCLFdBQUwsQ0FBaUJ6QyxJQUFqQixDQUFYOztBQUVBLFVBQUlvQixTQUFTLE1BQWIsRUFBcUI7QUFDbkI7QUFDRDs7QUFFRCxVQUFHLENBQUMsS0FBS3FELGFBQUwsQ0FBbUJ6RSxJQUFuQixDQUFKLEVBQThCOztBQUU1QixZQUFJbVUsZUFBSjs7QUFFQTtBQUNBLFlBQUcvUyxTQUFTLE1BQVosRUFDRStTLGtCQUFrQkYsaUJBQWlCaEIsS0FBakIsQ0FBdUIsSUFBdkIsRUFBNkJqVCxJQUE3QixDQUFsQixDQURGLEtBRUssSUFBR29CLFNBQVMsU0FBWixFQUNIK1Msa0JBQWtCRCxvQkFBb0JqQixLQUFwQixDQUEwQixJQUExQixFQUFnQ2pULElBQWhDLENBQWxCOztBQUVGLFlBQUk2TixTQUFTO0FBQ1h4TSxtQkFBUyxFQURFO0FBRVhHLHFCQUFXO0FBRkEsU0FBYjs7QUFLQSxZQUFJMlMsZUFBSixFQUFxQjtBQUNuQnRHLG1CQUFTLEtBQUt1RywwQkFBTCxDQUFnQ3BVLElBQWhDLEVBQXNDbVUsZUFBdEMsQ0FBVDtBQUNELFNBRkQsTUFHSztBQUNILGNBQUk5UyxVQUFVckIsS0FBS3NCLElBQUwsQ0FBVSxLQUFLTCxNQUFMLENBQVlHLElBQVosRUFBa0IsUUFBbEIsQ0FBVixDQUFkO0FBQ0EsY0FBSUksWUFBWXhCLEtBQUtzQixJQUFMLENBQVUsS0FBS0wsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFVBQWxCLENBQVYsQ0FBaEI7QUFDQSxjQUFJQyxXQUFXRyxTQUFmLEVBQTBCO0FBQ3hCcU0scUJBQVM7QUFDUHhNLHVCQUFTQSxPQURGO0FBRVBHLHlCQUFXQTtBQUZKLGFBQVQ7QUFJRDtBQUNGOztBQUVEO0FBQ0EsWUFBSXFNLE9BQU9yTSxTQUFQLENBQWlCdkMsTUFBakIsR0FBMEIsQ0FBOUIsRUFBaUM7QUFDL0JlLGVBQUtzQixJQUFMLENBQVUsS0FBS0wsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFFBQWxCLENBQVYsRUFBdUN5TSxPQUFPeE0sT0FBOUM7QUFDQXJCLGVBQUtzQixJQUFMLENBQVUsS0FBS0wsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFVBQWxCLENBQVYsRUFBeUN5TSxPQUFPck0sU0FBaEQ7QUFDQXhCLGVBQUs0TSxRQUFMLENBQWMsS0FBSzNMLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixPQUFsQixDQUFkO0FBQ0EsY0FBSXlNLE9BQU9yTSxTQUFQLENBQWlCdkMsTUFBakIsR0FBMEIsQ0FBOUIsRUFBaUM7QUFDL0JlLGlCQUFLNE0sUUFBTCxDQUFjLEtBQUszTCxNQUFMLENBQVlHLElBQVosRUFBa0IsWUFBbEIsQ0FBZDtBQUNEO0FBQ0YsU0FQRCxNQVFLO0FBQ0hwQixlQUFLc0IsSUFBTCxDQUFVLEtBQUtMLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixRQUFsQixDQUFWLEVBQXVDLEVBQXZDO0FBQ0FwQixlQUFLc0IsSUFBTCxDQUFVLEtBQUtMLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixVQUFsQixDQUFWLEVBQXlDLEVBQXpDO0FBQ0EsY0FBSXBCLEtBQUswQyxRQUFMLENBQWMsS0FBS3pCLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixPQUFsQixDQUFkLENBQUosRUFDRXBCLEtBQUsyTSxXQUFMLENBQWlCLEtBQUsxTCxNQUFMLENBQVlHLElBQVosRUFBa0IsT0FBbEIsQ0FBakI7QUFDRixjQUFJcEIsS0FBSzBDLFFBQUwsQ0FBYyxLQUFLekIsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFlBQWxCLENBQWQsQ0FBSixFQUNFcEIsS0FBSzJNLFdBQUwsQ0FBaUIsS0FBSzFMLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixZQUFsQixDQUFqQjtBQUNIO0FBQ0Y7QUFDRjtBQUNGLEdBN0d3Qjs7QUErR3pCcUQsaUJBQWUsdUJBQVN6RSxJQUFULEVBQWU7O0FBRTVCLFFBQUlvTyxTQUFTcE8sS0FBSytDLE1BQUwsR0FBY0MsUUFBZCxDQUF1QixHQUF2QixDQUFiO0FBQ0EsUUFBSXFMLFNBQVNyTyxLQUFLK0MsTUFBTCxHQUFjQyxRQUFkLENBQXVCLEdBQXZCLENBQWI7QUFDQSxRQUFJc0wsT0FBT3RPLEtBQUtjLE1BQUwsR0FBY2tDLFFBQWQsQ0FBdUIsR0FBdkIsQ0FBWDtBQUNBLFFBQUl1TCxPQUFPdk8sS0FBS2MsTUFBTCxHQUFja0MsUUFBZCxDQUF1QixHQUF2QixDQUFYOztBQUVBLFFBQUlvTCxVQUFVRSxJQUFWLElBQWtCRCxVQUFVRSxJQUE3QixJQUF3Q3ZPLEtBQUsrQyxNQUFMLEdBQWN4RCxFQUFkLE1BQXNCUyxLQUFLYyxNQUFMLEdBQWN2QixFQUFkLEVBQWpFLEVBQXFGO0FBQ25GLGFBQU8sSUFBUDtBQUNEO0FBQ0QsU0FBSSxJQUFJMkQsSUFBSSxDQUFaLEVBQWUsS0FBS3NRLGNBQUwsSUFBdUJ0USxJQUFLLEtBQUtzUSxjQUFMLENBQW9CdlUsTUFBL0QsRUFBdUVpRSxHQUF2RSxFQUEyRTtBQUN6RSxVQUFHbEQsS0FBSzBDLFFBQUwsQ0FBYyxLQUFLOFEsY0FBTCxDQUFvQnRRLENBQXBCLENBQWQsQ0FBSCxFQUNFLE9BQU8sSUFBUDtBQUNIO0FBQ0QsV0FBTyxLQUFQO0FBQ0QsR0E5SHdCO0FBK0h6QjtBQUNBbVIsb0JBQWtCLDBCQUFTbkYsUUFBVCxFQUFtQkMsUUFBbkIsRUFBNEI7QUFDNUMsUUFBR0QsU0FBU3RMLENBQVQsSUFBY3VMLFNBQVN2TCxDQUF2QixJQUE0QnNMLFNBQVN2TCxDQUFULEdBQWF3TCxTQUFTeEwsQ0FBckQsRUFBdUQ7QUFDckQsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxRQUFHdUwsU0FBU3RMLENBQVQsR0FBYXVMLFNBQVN2TCxDQUF0QixJQUEyQnNMLFNBQVN2TCxDQUFULEdBQWF3TCxTQUFTeEwsQ0FBcEQsRUFBc0Q7QUFDcEQsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxRQUFHdUwsU0FBU3RMLENBQVQsR0FBYXVMLFNBQVN2TCxDQUF0QixJQUEyQnNMLFNBQVN2TCxDQUFULElBQWN3TCxTQUFTeEwsQ0FBckQsRUFBdUQ7QUFDckQsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxRQUFHdUwsU0FBU3RMLENBQVQsR0FBYXVMLFNBQVN2TCxDQUF0QixJQUEyQnNMLFNBQVN2TCxDQUFULEdBQWF3TCxTQUFTeEwsQ0FBcEQsRUFBc0Q7QUFDcEQsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxRQUFHdUwsU0FBU3RMLENBQVQsSUFBY3VMLFNBQVN2TCxDQUF2QixJQUE0QnNMLFNBQVN2TCxDQUFULEdBQWF3TCxTQUFTeEwsQ0FBckQsRUFBdUQ7QUFDckQsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxRQUFHdUwsU0FBU3RMLENBQVQsR0FBYXVMLFNBQVN2TCxDQUF0QixJQUEyQnNMLFNBQVN2TCxDQUFULEdBQWF3TCxTQUFTeEwsQ0FBcEQsRUFBc0Q7QUFDcEQsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxRQUFHdUwsU0FBU3RMLENBQVQsR0FBYXVMLFNBQVN2TCxDQUF0QixJQUEyQnNMLFNBQVN2TCxDQUFULElBQWN3TCxTQUFTeEwsQ0FBckQsRUFBdUQ7QUFDckQsYUFBTyxDQUFQO0FBQ0Q7QUFDRCxXQUFPLENBQVAsQ0F0QjRDLENBc0JuQztBQUNWLEdBdkp3QjtBQXdKekIyUSw4QkFBNEIsb0NBQVV0VSxJQUFWLEVBQWdCO0FBQzFDLFFBQUl1VSxhQUFhdlUsS0FBSytDLE1BQUwsRUFBakI7QUFDQSxRQUFJeVIsYUFBYXhVLEtBQUtjLE1BQUwsRUFBakI7O0FBRUEsUUFBSTJULGNBQWNELFdBQVd4UixRQUFYLEVBQWxCO0FBQ0EsUUFBSTBSLGNBQWNILFdBQVd2UixRQUFYLEVBQWxCOztBQUVBLFFBQUlrTSxXQUFXcUYsV0FBV3ZSLFFBQVgsRUFBZjtBQUNBLFFBQUltTSxXQUFXcUYsV0FBV3hSLFFBQVgsRUFBZjs7QUFHQSxRQUFJK0wsS0FBSyxDQUFDSSxTQUFTdkwsQ0FBVCxHQUFhc0wsU0FBU3RMLENBQXZCLEtBQTZCdUwsU0FBU3hMLENBQVQsR0FBYXVMLFNBQVN2TCxDQUFuRCxDQUFUO0FBQ0EsUUFBSXFMLEtBQUssQ0FBQyxDQUFELEdBQUtELEVBQWQ7O0FBRUEsV0FBTztBQUNMQSxVQUFJQSxFQURDO0FBRUxDLFVBQUlBLEVBRkM7QUFHTEUsZ0JBQVVBLFFBSEw7QUFJTEMsZ0JBQVVBO0FBSkwsS0FBUDtBQU1ELEdBNUt3QjtBQTZLekJFLG1CQUFpQix5QkFBU3JQLElBQVQsRUFBZTJVLEtBQWYsRUFBc0IxRix1QkFBdEIsRUFBOEM7QUFDN0QsUUFBSUEsNEJBQTRCaFAsU0FBaEMsRUFBMkM7QUFDekNnUCxnQ0FBMEIsS0FBS3FGLDBCQUFMLENBQWdDdFUsSUFBaEMsQ0FBMUI7QUFDRDs7QUFFRCxRQUFJa1AsV0FBV0Qsd0JBQXdCQyxRQUF2QztBQUNBLFFBQUlDLFdBQVdGLHdCQUF3QkUsUUFBdkM7QUFDQSxRQUFJSixLQUFLRSx3QkFBd0JGLEVBQWpDO0FBQ0EsUUFBSUMsS0FBS0Msd0JBQXdCRCxFQUFqQzs7QUFFQSxRQUFJNEYsVUFBSjtBQUNBLFFBQUlDLFVBQUo7O0FBRUEsUUFBRzlGLE1BQU0rRixRQUFOLElBQWtCL0YsTUFBTSxDQUFDK0YsUUFBNUIsRUFBcUM7QUFDbkNGLG1CQUFhMUYsU0FBU3ZMLENBQXRCO0FBQ0FrUixtQkFBYUYsTUFBTS9RLENBQW5CO0FBQ0QsS0FIRCxNQUlLLElBQUdtTCxNQUFNLENBQVQsRUFBVztBQUNkNkYsbUJBQWFELE1BQU1oUixDQUFuQjtBQUNBa1IsbUJBQWEzRixTQUFTdEwsQ0FBdEI7QUFDRCxLQUhJLE1BSUE7QUFDSCxVQUFJbVIsS0FBSzdGLFNBQVN0TCxDQUFULEdBQWFtTCxLQUFLRyxTQUFTdkwsQ0FBcEM7QUFDQSxVQUFJcVIsS0FBS0wsTUFBTS9RLENBQU4sR0FBVW9MLEtBQUsyRixNQUFNaFIsQ0FBOUI7O0FBRUFpUixtQkFBYSxDQUFDSSxLQUFLRCxFQUFOLEtBQWFoRyxLQUFLQyxFQUFsQixDQUFiO0FBQ0E2RixtQkFBYTlGLEtBQUs2RixVQUFMLEdBQWtCRyxFQUEvQjtBQUNEOztBQUVEO0FBQ0E7QUFDQSxRQUFJRSxvQkFBb0I7QUFDdEJ0UixTQUFHaVIsVUFEbUI7QUFFdEJoUixTQUFHaVI7QUFGbUIsS0FBeEI7O0FBS0EsV0FBT0ksaUJBQVA7QUFDRCxHQWxOd0I7QUFtTnpCclMscUJBQW1CLDJCQUFTNUMsSUFBVCxFQUFlO0FBQ2hDLFFBQUlvQixPQUFPLEtBQUtxQixXQUFMLENBQWlCekMsSUFBakIsQ0FBWDs7QUFFQSxRQUFHb0IsU0FBUyxNQUFaLEVBQW1CO0FBQ2pCLGFBQU9uQixTQUFQO0FBQ0Q7O0FBRUQsUUFBSUQsS0FBSzZHLEdBQUwsQ0FBUyxhQUFULE1BQTRCLEtBQUs1RixNQUFMLENBQVlHLElBQVosRUFBa0IsTUFBbEIsQ0FBaEMsRUFBNEQ7QUFDMUQsYUFBT25CLFNBQVA7QUFDRDs7QUFFRCxRQUFJMEMsYUFBYSxFQUFqQjs7QUFFQSxRQUFJdEIsVUFBVXJCLEtBQUtrVixNQUFMLENBQWEsS0FBS2pVLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixXQUFsQixDQUFiLElBQ0FwQixLQUFLa1YsTUFBTCxDQUFhLEtBQUtqVSxNQUFMLENBQVlHLElBQVosRUFBa0IsV0FBbEIsQ0FBYixFQUE4QytULE9BRDlDLEdBQ3dELEVBRHRFO0FBRUEsUUFBSTNULFlBQVl4QixLQUFLa1YsTUFBTCxDQUFhLEtBQUtqVSxNQUFMLENBQVlHLElBQVosRUFBa0IsYUFBbEIsQ0FBYixJQUNGcEIsS0FBS2tWLE1BQUwsQ0FBYSxLQUFLalUsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLGFBQWxCLENBQWIsRUFBZ0QrVCxPQUQ5QyxHQUN3RCxFQUR4RTtBQUVBLFFBQUlDLGFBQWEvTCxLQUFLZ00sR0FBTCxDQUFVaFUsUUFBUXBDLE1BQWxCLEVBQTBCdUMsVUFBVXZDLE1BQXBDLENBQWpCOztBQUVBLFFBQUk2RCxTQUFTOUMsS0FBSytDLE1BQUwsR0FBY0MsUUFBZCxFQUFiO0FBQ0EsUUFBSUMsU0FBU2pELEtBQUtjLE1BQUwsR0FBY2tDLFFBQWQsRUFBYjs7QUFFQSxRQUFJNlAsS0FBTzVQLE9BQU9XLENBQVAsR0FBV2QsT0FBT2MsQ0FBN0I7QUFDQSxRQUFJZ1AsS0FBTzNQLE9BQU9VLENBQVAsR0FBV2IsT0FBT2EsQ0FBN0I7O0FBRUEsUUFBSTJSLElBQUlqTSxLQUFLQyxJQUFMLENBQVdzSixLQUFLQSxFQUFMLEdBQVVDLEtBQUtBLEVBQTFCLENBQVI7O0FBRUEsUUFBSTBDLFNBQVM7QUFDWDVSLFNBQUdpUCxFQURRO0FBRVhoUCxTQUFHaVA7QUFGUSxLQUFiOztBQUtBLFFBQUkyQyxhQUFhO0FBQ2Y3UixTQUFHNFIsT0FBTzVSLENBQVAsR0FBVzJSLENBREM7QUFFZjFSLFNBQUcyUixPQUFPM1IsQ0FBUCxHQUFXMFI7QUFGQyxLQUFqQjs7QUFLQSxRQUFJRyxvQkFBb0I7QUFDdEI5UixTQUFHLENBQUM2UixXQUFXNVIsQ0FETztBQUV0QkEsU0FBRzRSLFdBQVc3UjtBQUZRLEtBQXhCOztBQUtBLFNBQUssSUFBSStSLElBQUksQ0FBYixFQUFnQkEsSUFBSU4sVUFBcEIsRUFBZ0NNLEdBQWhDLEVBQXFDO0FBQ25DLFVBQUlDLElBQUl0VSxRQUFTcVUsQ0FBVCxDQUFSO0FBQ0EsVUFBSUUsSUFBSXBVLFVBQVdrVSxDQUFYLENBQVI7O0FBRUEsVUFBSUcsS0FBTSxJQUFJRixDQUFkO0FBQ0EsVUFBSUcsS0FBS0gsQ0FBVDs7QUFFQSxVQUFJSSxTQUFTO0FBQ1hDLFlBQUlsVCxPQUFPYSxDQURBO0FBRVhzUyxZQUFJaFQsT0FBT1UsQ0FGQTtBQUdYdVMsWUFBSXBULE9BQU9jLENBSEE7QUFJWHVTLFlBQUlsVCxPQUFPVztBQUpBLE9BQWI7O0FBT0EsVUFBSXdTLFdBQVdMLE1BQWY7O0FBRUEsVUFBSU0sZ0JBQWdCO0FBQ2xCMVMsV0FBR3lTLFNBQVNKLEVBQVQsR0FBY0gsRUFBZCxHQUFtQk8sU0FBU0gsRUFBVCxHQUFjSCxFQURsQjtBQUVsQmxTLFdBQUd3UyxTQUFTRixFQUFULEdBQWNMLEVBQWQsR0FBbUJPLFNBQVNELEVBQVQsR0FBY0w7QUFGbEIsT0FBcEI7O0FBS0FuVCxpQkFBV3dCLElBQVgsQ0FDRWtTLGNBQWMxUyxDQUFkLEdBQWtCOFIsa0JBQWtCOVIsQ0FBbEIsR0FBc0JpUyxDQUQxQyxFQUVFUyxjQUFjelMsQ0FBZCxHQUFrQjZSLGtCQUFrQjdSLENBQWxCLEdBQXNCZ1MsQ0FGMUM7QUFJRDs7QUFFRCxXQUFPalQsVUFBUDtBQUNELEdBelJ3QjtBQTBSekJ5Siw2QkFBMkIsbUNBQVVwTSxJQUFWLEVBQWdCMlUsS0FBaEIsRUFBdUIxRix1QkFBdkIsRUFBZ0Q7QUFDekUsUUFBSUEsNEJBQTRCaFAsU0FBaEMsRUFBMkM7QUFDekNnUCxnQ0FBMEIsS0FBS3FGLDBCQUFMLENBQWdDdFUsSUFBaEMsQ0FBMUI7QUFDRDs7QUFFRCxRQUFJaVYsb0JBQW9CLEtBQUs1RixlQUFMLENBQXFCclAsSUFBckIsRUFBMkIyVSxLQUEzQixFQUFrQzFGLHVCQUFsQyxDQUF4QjtBQUNBLFFBQUkyRixhQUFhSyxrQkFBa0J0UixDQUFuQztBQUNBLFFBQUlrUixhQUFhSSxrQkFBa0JyUixDQUFuQzs7QUFFQSxRQUFJc0wsV0FBV0Qsd0JBQXdCQyxRQUF2QztBQUNBLFFBQUlDLFdBQVdGLHdCQUF3QkUsUUFBdkM7O0FBRUEsUUFBSTlDLE1BQUo7O0FBRUEsUUFBSXVJLGNBQWMxRixTQUFTdkwsQ0FBM0IsRUFBK0I7QUFDN0IwSSxlQUFTLENBQUN1SSxhQUFhMUYsU0FBU3ZMLENBQXZCLEtBQTZCd0wsU0FBU3hMLENBQVQsR0FBYXVMLFNBQVN2TCxDQUFuRCxDQUFUO0FBQ0QsS0FGRCxNQUdLLElBQUlrUixjQUFjM0YsU0FBU3RMLENBQTNCLEVBQStCO0FBQ2xDeUksZUFBUyxDQUFDd0ksYUFBYTNGLFNBQVN0TCxDQUF2QixLQUE2QnVMLFNBQVN2TCxDQUFULEdBQWFzTCxTQUFTdEwsQ0FBbkQsQ0FBVDtBQUNELEtBRkksTUFHQTtBQUNIeUksZUFBUyxDQUFUO0FBQ0Q7O0FBRUQsUUFBSUMsV0FBV2pELEtBQUtDLElBQUwsQ0FBVUQsS0FBS0UsR0FBTCxDQUFVc0wsYUFBYUYsTUFBTS9RLENBQTdCLEVBQWlDLENBQWpDLElBQ25CeUYsS0FBS0UsR0FBTCxDQUFVcUwsYUFBYUQsTUFBTWhSLENBQTdCLEVBQWlDLENBQWpDLENBRFMsQ0FBZjs7QUFHQTtBQUNBLFFBQUkyUyxhQUFhLEtBQUtqQyxnQkFBTCxDQUFzQm5GLFFBQXRCLEVBQWdDQyxRQUFoQyxDQUFqQjtBQUNBO0FBQ0EsUUFBSW9ILGFBQWEsS0FBS2xDLGdCQUFMLENBQXNCWSxpQkFBdEIsRUFBeUNOLEtBQXpDLENBQWpCOztBQUVBO0FBQ0EsUUFBRzJCLGFBQWFDLFVBQWIsSUFBMkIsQ0FBQyxDQUE1QixJQUFpQ0QsYUFBYUMsVUFBYixJQUEyQixDQUEvRCxFQUFpRTtBQUMvRCxVQUFHakssWUFBWSxDQUFmLEVBQ0VBLFdBQVcsQ0FBQyxDQUFELEdBQUtBLFFBQWhCO0FBQ0g7O0FBRUQsV0FBTztBQUNMRCxjQUFRQSxNQURIO0FBRUxDLGdCQUFVQTtBQUZMLEtBQVA7QUFJRCxHQXBVd0I7QUFxVXpCOEgsOEJBQTRCLG9DQUFVcFUsSUFBVixFQUFnQndXLFlBQWhCLEVBQThCO0FBQ3hELFFBQUl2SCwwQkFBMEIsS0FBS3FGLDBCQUFMLENBQWdDdFUsSUFBaEMsQ0FBOUI7O0FBRUEsUUFBSXFCLFVBQVUsRUFBZDtBQUNBLFFBQUlHLFlBQVksRUFBaEI7O0FBRUEsU0FBSyxJQUFJMEIsSUFBSSxDQUFiLEVBQWdCc1QsZ0JBQWdCdFQsSUFBSXNULGFBQWF2WCxNQUFqRCxFQUF5RGlFLEdBQXpELEVBQThEO0FBQzVELFVBQUkzQyxTQUFTaVcsYUFBYXRULENBQWIsQ0FBYjtBQUNBLFVBQUlpSix5QkFBeUIsS0FBS0MseUJBQUwsQ0FBK0JwTSxJQUEvQixFQUFxQ08sTUFBckMsRUFBNkMwTyx1QkFBN0MsQ0FBN0I7O0FBRUE1TixjQUFROEMsSUFBUixDQUFhZ0ksdUJBQXVCRSxNQUFwQztBQUNBN0ssZ0JBQVUyQyxJQUFWLENBQWVnSSx1QkFBdUJHLFFBQXRDO0FBQ0Q7O0FBRUQsV0FBTztBQUNMakwsZUFBU0EsT0FESjtBQUVMRyxpQkFBV0E7QUFGTixLQUFQO0FBSUQsR0F2VndCO0FBd1Z6QmlWLHNCQUFvQiw0QkFBVXpXLElBQVYsRUFBZ0JvQixJQUFoQixFQUFzQjtBQUN4QyxRQUFJc1YsTUFBTSxFQUFWOztBQUVBLFFBQUlsVixZQUFZeEIsS0FBS3NCLElBQUwsQ0FBVSxLQUFLTCxNQUFMLENBQVlHLElBQVosRUFBa0IsVUFBbEIsQ0FBVixDQUFoQjtBQUNBLFNBQUssSUFBSThCLElBQUksQ0FBYixFQUFnQjFCLGFBQWEwQixJQUFJMUIsVUFBVXZDLE1BQTNDLEVBQW1EaUUsR0FBbkQsRUFBd0Q7QUFDdER3VCxZQUFNQSxNQUFNLEdBQU4sR0FBWWxWLFVBQVUwQixDQUFWLENBQWxCO0FBQ0Q7O0FBRUQsV0FBT3dULEdBQVA7QUFDRCxHQWpXd0I7QUFrV3pCQyxvQkFBa0IsMEJBQVUzVyxJQUFWLEVBQWdCb0IsSUFBaEIsRUFBc0I7QUFDdEMsUUFBSXNWLE1BQU0sRUFBVjs7QUFFQSxRQUFJclYsVUFBVXJCLEtBQUtzQixJQUFMLENBQVUsS0FBS0wsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFFBQWxCLENBQVYsQ0FBZDtBQUNBLFNBQUssSUFBSThCLElBQUksQ0FBYixFQUFnQjdCLFdBQVc2QixJQUFJN0IsUUFBUXBDLE1BQXZDLEVBQStDaUUsR0FBL0MsRUFBb0Q7QUFDbER3VCxZQUFNQSxNQUFNLEdBQU4sR0FBWXJWLFFBQVE2QixDQUFSLENBQWxCO0FBQ0Q7O0FBRUQsV0FBT3dULEdBQVA7QUFDRCxHQTNXd0I7QUE0V3pCL1Isa0JBQWdCLHdCQUFTM0UsSUFBVCxFQUFlNFcsY0FBZixFQUFpRDtBQUFBLFFBQWxCeFYsSUFBa0IsdUVBQVhuQixTQUFXOztBQUMvRCxRQUFHRCxTQUFTQyxTQUFULElBQXNCMlcsbUJBQW1CM1csU0FBNUMsRUFBc0Q7QUFDcERELGFBQU8sS0FBS3dSLGNBQVo7QUFDQW9GLHVCQUFpQixLQUFLdEYsYUFBdEI7QUFDRDs7QUFFRCxRQUFHbFEsU0FBU25CLFNBQVosRUFDRW1CLE9BQU8sS0FBS3FCLFdBQUwsQ0FBaUJ6QyxJQUFqQixDQUFQOztBQUVGLFFBQUlnQixZQUFZLEtBQUtDLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixRQUFsQixDQUFoQjtBQUNBLFFBQUlGLGNBQWMsS0FBS0QsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFVBQWxCLENBQWxCOztBQUVBLFFBQUl5VixtQkFBbUIsS0FBS3pLLHlCQUFMLENBQStCcE0sSUFBL0IsRUFBcUM0VyxjQUFyQyxDQUF2QjtBQUNBLFFBQUlFLHVCQUF1QkQsaUJBQWlCeEssTUFBNUM7O0FBRUEsUUFBSStCLFNBQVNwTyxLQUFLK0MsTUFBTCxHQUFjQyxRQUFkLENBQXVCLEdBQXZCLENBQWI7QUFDQSxRQUFJcUwsU0FBU3JPLEtBQUsrQyxNQUFMLEdBQWNDLFFBQWQsQ0FBdUIsR0FBdkIsQ0FBYjtBQUNBLFFBQUlzTCxPQUFPdE8sS0FBS2MsTUFBTCxHQUFja0MsUUFBZCxDQUF1QixHQUF2QixDQUFYO0FBQ0EsUUFBSXVMLE9BQU92TyxLQUFLYyxNQUFMLEdBQWNrQyxRQUFkLENBQXVCLEdBQXZCLENBQVg7QUFDQSxRQUFJK1QsY0FBYyxLQUFLM0sseUJBQUwsQ0FBK0JwTSxJQUEvQixFQUFxQyxFQUFDMkQsR0FBR3lLLE1BQUosRUFBWXhLLEdBQUd5SyxNQUFmLEVBQXJDLEVBQTZEaEMsTUFBL0U7QUFDQSxRQUFJMkssWUFBWSxLQUFLNUsseUJBQUwsQ0FBK0JwTSxJQUEvQixFQUFxQyxFQUFDMkQsR0FBRzJLLElBQUosRUFBVTFLLEdBQUcySyxJQUFiLEVBQXJDLEVBQXlEbEMsTUFBekU7QUFDQSxRQUFJNEssb0JBQW9CLENBQUNGLFdBQUQsRUFBY3hWLE1BQWQsQ0FBcUJ2QixLQUFLc0IsSUFBTCxDQUFVTixTQUFWLElBQXFCaEIsS0FBS3NCLElBQUwsQ0FBVU4sU0FBVixDQUFyQixHQUEwQyxFQUEvRCxFQUFtRU8sTUFBbkUsQ0FBMEUsQ0FBQ3lWLFNBQUQsQ0FBMUUsQ0FBeEI7O0FBRUEsUUFBSUUsY0FBYyxLQUFLdFUsaUJBQUwsQ0FBdUI1QyxJQUF2QixDQUFsQjs7QUFFQSxRQUFJbVgsVUFBVXJDLFFBQWQ7QUFDQSxRQUFJc0MsWUFBSjtBQUNBLFFBQUlDLGdCQUFnQixDQUFDakosTUFBRCxFQUFTQyxNQUFULEVBQ1g5TSxNQURXLENBQ0oyVixjQUFZQSxXQUFaLEdBQXdCLEVBRHBCLEVBRVgzVixNQUZXLENBRUosQ0FBQytNLElBQUQsRUFBT0MsSUFBUCxDQUZJLENBQXBCO0FBR0EsUUFBSStJLGlCQUFpQixDQUFDLENBQXRCOztBQUVBLFNBQUksSUFBSXBVLElBQUksQ0FBWixFQUFlQSxJQUFJK1Qsa0JBQWtCaFksTUFBbEIsR0FBMkIsQ0FBOUMsRUFBaURpRSxHQUFqRCxFQUFxRDtBQUNuRCxVQUFJMlMsS0FBS29CLGtCQUFrQi9ULENBQWxCLENBQVQ7QUFDQSxVQUFJNFMsS0FBS21CLGtCQUFrQi9ULElBQUksQ0FBdEIsQ0FBVDs7QUFFQTtBQUNBLFVBQU1xVSxLQUFLLEtBQUtDLG9CQUFMLENBQTBCVixvQkFBMUIsRUFBZ0RqQixFQUFoRCxFQUFvRCxJQUFwRCxDQUFYO0FBQ0EsVUFBTTRCLEtBQUssS0FBS0Qsb0JBQUwsQ0FBMEJWLG9CQUExQixFQUFnRGhCLEVBQWhELENBQVg7QUFDQSxVQUFNNEIsS0FBSyxLQUFLRixvQkFBTCxDQUEwQlYsb0JBQTFCLEVBQWdEaEIsRUFBaEQsRUFBb0QsSUFBcEQsQ0FBWDtBQUNBLFVBQU02QixLQUFLLEtBQUtILG9CQUFMLENBQTBCVixvQkFBMUIsRUFBZ0RqQixFQUFoRCxDQUFYO0FBQ0EsVUFBSzBCLE1BQU1FLEVBQVAsSUFBZUMsTUFBTUMsRUFBekIsRUFBNkI7QUFDM0IsWUFBSXZKLFNBQVNpSixjQUFjLElBQUluVSxDQUFsQixDQUFiO0FBQ0EsWUFBSW1MLFNBQVNnSixjQUFjLElBQUluVSxDQUFKLEdBQVEsQ0FBdEIsQ0FBYjtBQUNBLFlBQUlvTCxPQUFPK0ksY0FBYyxJQUFJblUsQ0FBSixHQUFRLENBQXRCLENBQVg7QUFDQSxZQUFJcUwsT0FBTzhJLGNBQWMsSUFBSW5VLENBQUosR0FBUSxDQUF0QixDQUFYOztBQUVBLFlBQUkwVSxRQUFRO0FBQ1ZqVSxhQUFHeUssTUFETztBQUVWeEssYUFBR3lLO0FBRk8sU0FBWjs7QUFLQSxZQUFJd0osTUFBTTtBQUNSbFUsYUFBRzJLLElBREs7QUFFUjFLLGFBQUcySztBQUZLLFNBQVY7O0FBS0EsWUFBSVEsS0FBSyxDQUFFVixTQUFTRSxJQUFYLEtBQXNCSCxTQUFTRSxJQUEvQixDQUFUO0FBQ0EsWUFBSVUsS0FBSyxDQUFDLENBQUQsR0FBS0QsRUFBZDs7QUFFQSxZQUFJRSwwQkFBMEI7QUFDNUJDLG9CQUFVMEksS0FEa0I7QUFFNUJ6SSxvQkFBVTBJLEdBRmtCO0FBRzVCOUksY0FBSUEsRUFId0I7QUFJNUJDLGNBQUlBO0FBSndCLFNBQTlCOztBQU9BLFlBQUlJLHNCQUFzQixLQUFLQyxlQUFMLENBQXFCclAsSUFBckIsRUFBMkI0VyxjQUEzQixFQUEyQzNILHVCQUEzQyxDQUExQjtBQUNBLFlBQUlLLE9BQU9qRyxLQUFLQyxJQUFMLENBQVdELEtBQUtFLEdBQUwsQ0FBV3FOLGVBQWVqVCxDQUFmLEdBQW1CeUwsb0JBQW9CekwsQ0FBbEQsRUFBc0QsQ0FBdEQsSUFDWjBGLEtBQUtFLEdBQUwsQ0FBV3FOLGVBQWVoVCxDQUFmLEdBQW1Cd0wsb0JBQW9CeEwsQ0FBbEQsRUFBc0QsQ0FBdEQsQ0FEQyxDQUFYOztBQUdBO0FBQ0EsWUFBRzBMLE9BQU82SCxPQUFWLEVBQWtCO0FBQ2hCQSxvQkFBVTdILElBQVY7QUFDQThILHlCQUFlaEksbUJBQWY7QUFDQWtJLDJCQUFpQnBVLENBQWpCO0FBQ0Q7QUFDRjtBQUNGOztBQUVELFFBQUdrVSxpQkFBaUJuWCxTQUFwQixFQUE4QjtBQUM1QjJXLHVCQUFpQlEsWUFBakI7QUFDRDs7QUFFRFAsdUJBQW1CLEtBQUt6Syx5QkFBTCxDQUErQnBNLElBQS9CLEVBQXFDNFcsY0FBckMsQ0FBbkI7O0FBRUEsUUFBR1EsaUJBQWlCblgsU0FBcEIsRUFBOEI7QUFDNUI0Vyx1QkFBaUJ2SyxRQUFqQixHQUE0QixDQUE1QjtBQUNEOztBQUVELFFBQUlqTCxVQUFVckIsS0FBS3NCLElBQUwsQ0FBVU4sU0FBVixDQUFkO0FBQ0EsUUFBSVEsWUFBWXhCLEtBQUtzQixJQUFMLENBQVVKLFdBQVYsQ0FBaEI7O0FBRUFHLGNBQVVBLFVBQVFBLE9BQVIsR0FBZ0IsRUFBMUI7QUFDQUcsZ0JBQVlBLFlBQVVBLFNBQVYsR0FBb0IsRUFBaEM7O0FBRUEsUUFBR0gsUUFBUXBDLE1BQVIsS0FBbUIsQ0FBdEIsRUFBeUI7QUFDdkJxWSx1QkFBaUIsQ0FBakI7QUFDRDs7QUFFTDtBQUNBO0FBQ0ksUUFBR0Esa0JBQWtCLENBQUMsQ0FBdEIsRUFBd0I7QUFDdEJqVyxjQUFReVcsTUFBUixDQUFlUixjQUFmLEVBQStCLENBQS9CLEVBQWtDVCxpQkFBaUJ4SyxNQUFuRDtBQUNBN0ssZ0JBQVVzVyxNQUFWLENBQWlCUixjQUFqQixFQUFpQyxDQUFqQyxFQUFvQ1QsaUJBQWlCdkssUUFBckQ7QUFDRDs7QUFFRHRNLFNBQUtzQixJQUFMLENBQVVOLFNBQVYsRUFBcUJLLE9BQXJCO0FBQ0FyQixTQUFLc0IsSUFBTCxDQUFVSixXQUFWLEVBQXVCTSxTQUF2Qjs7QUFFQXhCLFNBQUs0TSxRQUFMLENBQWMsS0FBSzNMLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixPQUFsQixDQUFkO0FBQ0EsUUFBSUMsUUFBUXBDLE1BQVIsR0FBaUIsQ0FBakIsSUFBc0J1QyxVQUFVdkMsTUFBVixHQUFtQixDQUE3QyxFQUFnRDtBQUM5Q2UsV0FBSzRNLFFBQUwsQ0FBYyxLQUFLM0wsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFlBQWxCLENBQWQ7QUFDRDs7QUFFRCxXQUFPa1csY0FBUDtBQUNELEdBaGV3QjtBQWllekJwUyxnQkFBYyxzQkFBU2xGLElBQVQsRUFBZXlPLFdBQWYsRUFBMkI7QUFDdkMsUUFBR3pPLFNBQVNDLFNBQVQsSUFBc0J3TyxnQkFBZ0J4TyxTQUF6QyxFQUFtRDtBQUNqREQsYUFBTyxLQUFLd1IsY0FBWjtBQUNBL0Msb0JBQWMsS0FBSzhDLGtCQUFuQjtBQUNEOztBQUVELFFBQUluUSxPQUFPLEtBQUtxQixXQUFMLENBQWlCekMsSUFBakIsQ0FBWDs7QUFFQSxRQUFHLEtBQUtpRiwwQkFBTCxDQUFnQzdELElBQWhDLEVBQXNDLHVDQUF0QyxDQUFILEVBQWtGO0FBQ2hGO0FBQ0Q7O0FBRUQsUUFBSUYsY0FBYyxLQUFLRCxNQUFMLENBQVlHLElBQVosRUFBa0IsUUFBbEIsQ0FBbEI7QUFDQSxRQUFJSixZQUFZLEtBQUtDLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixVQUFsQixDQUFoQjs7QUFFQSxRQUFJSSxZQUFZeEIsS0FBS3NCLElBQUwsQ0FBVUosV0FBVixDQUFoQjtBQUNBLFFBQUlHLFVBQVVyQixLQUFLc0IsSUFBTCxDQUFVTixTQUFWLENBQWQ7QUFDQSxRQUFJK1csU0FBSjtBQUNBLFFBQUkzVyxTQUFTLE1BQWIsRUFBcUI7QUFDbkIyVyxrQkFBWSxLQUFLcmIsT0FBTCxDQUFhcVAscUJBQWIsQ0FBbUMvTCxJQUFuQyxDQUFaO0FBQ0QsS0FGRCxNQUdLLElBQUlvQixTQUFTLFNBQWIsRUFBd0I7QUFDM0IyVyxrQkFBWSxLQUFLcmIsT0FBTCxDQUFhc1Asd0JBQWIsQ0FBc0NoTSxJQUF0QyxDQUFaO0FBQ0Q7O0FBRUR3QixjQUFVc1csTUFBVixDQUFpQnJKLFdBQWpCLEVBQThCLENBQTlCO0FBQ0FwTixZQUFReVcsTUFBUixDQUFlckosV0FBZixFQUE0QixDQUE1QjtBQUNBO0FBQ0E7QUFDQSxRQUFJc0osU0FBSixFQUNFQSxVQUFVRCxNQUFWLENBQWlCckosV0FBakIsRUFBOEIsQ0FBOUI7O0FBRUY7QUFDQSxRQUFJak4sVUFBVXZDLE1BQVYsSUFBb0IsQ0FBcEIsSUFBeUJvQyxRQUFRcEMsTUFBUixJQUFrQixDQUEvQyxFQUFrRDtBQUNoRGUsV0FBSzJNLFdBQUwsQ0FBaUIsS0FBSzFMLE1BQUwsQ0FBWUcsSUFBWixFQUFrQixZQUFsQixDQUFqQjtBQUNEO0FBQ0Q7QUFIQSxTQUlLLElBQUdJLFVBQVV2QyxNQUFWLElBQW9CLENBQXBCLElBQXlCb0MsUUFBUXBDLE1BQVIsSUFBa0IsQ0FBOUMsRUFBZ0Q7QUFDbkRlLGFBQUsyTSxXQUFMLENBQWlCLEtBQUsxTCxNQUFMLENBQVlHLElBQVosRUFBa0IsT0FBbEIsQ0FBakI7QUFDQXBCLGFBQUtzQixJQUFMLENBQVVKLFdBQVYsRUFBdUIsRUFBdkI7QUFDQWxCLGFBQUtzQixJQUFMLENBQVVOLFNBQVYsRUFBcUIsRUFBckI7QUFDRCxPQUpJLE1BS0E7QUFDSGhCLGFBQUtzQixJQUFMLENBQVVKLFdBQVYsRUFBdUJNLFNBQXZCO0FBQ0F4QixhQUFLc0IsSUFBTCxDQUFVTixTQUFWLEVBQXFCSyxPQUFyQjtBQUNEO0FBQ0YsR0EvZ0J3QjtBQWdoQnpCZ0Usb0JBQWtCLDBCQUFTckYsSUFBVCxFQUFlO0FBQy9CLFFBQUlBLFNBQVNDLFNBQWIsRUFBd0I7QUFDdEJELGFBQU8sS0FBS3dSLGNBQVo7QUFDRDtBQUNELFFBQUlwUSxPQUFPLEtBQUtxQixXQUFMLENBQWlCekMsSUFBakIsQ0FBWDs7QUFFQSxRQUFHLEtBQUtpRiwwQkFBTCxDQUFnQzdELElBQWhDLEVBQXNDLDJDQUF0QyxDQUFILEVBQXNGO0FBQ3BGO0FBQ0Q7O0FBRUQ7QUFDQXBCLFNBQUsyTSxXQUFMLENBQWlCLEtBQUsxTCxNQUFMLENBQVlHLElBQVosRUFBa0IsT0FBbEIsQ0FBakI7QUFDQXBCLFNBQUsyTSxXQUFMLENBQWlCLEtBQUsxTCxNQUFMLENBQVlHLElBQVosRUFBa0IsWUFBbEIsQ0FBakI7O0FBRUE7QUFDQSxRQUFJRixjQUFjLEtBQUtELE1BQUwsQ0FBWUcsSUFBWixFQUFrQixRQUFsQixDQUFsQjtBQUNBLFFBQUlKLFlBQVksS0FBS0MsTUFBTCxDQUFZRyxJQUFaLEVBQWtCLFVBQWxCLENBQWhCO0FBQ0FwQixTQUFLc0IsSUFBTCxDQUFVSixXQUFWLEVBQXVCLEVBQXZCO0FBQ0FsQixTQUFLc0IsSUFBTCxDQUFVTixTQUFWLEVBQXFCLEVBQXJCO0FBQ0E7QUFDQTtBQUNBLFFBQUlJLFNBQVMsTUFBVCxJQUFtQixLQUFLMUUsT0FBTCxDQUFhcVAscUJBQWIsQ0FBbUMvTCxJQUFuQyxDQUF2QixFQUFpRTtBQUMvRCxXQUFLdEQsT0FBTCxDQUFha1AsZ0NBQWIsQ0FBOEM1TCxJQUE5QyxFQUFvRCxFQUFwRDtBQUNELEtBRkQsTUFHSyxJQUFJb0IsU0FBUyxTQUFULElBQXNCLEtBQUsxRSxPQUFMLENBQWFzUCx3QkFBYixDQUFzQ2hNLElBQXRDLENBQTFCLEVBQXVFO0FBQzFFLFdBQUt0RCxPQUFMLENBQWFtUCxtQ0FBYixDQUFpRDdMLElBQWpELEVBQXVELEVBQXZEO0FBQ0Q7QUFDRixHQTNpQndCO0FBNGlCekJnWSxxQkFBbUIsMkJBQVNDLEdBQVQsRUFBY0MsR0FBZCxFQUFtQjtBQUNwQyxRQUFJQyxRQUFRRixJQUFJdFUsQ0FBSixHQUFRdVUsSUFBSXZVLENBQXhCO0FBQ0EsUUFBSXlVLFFBQVFILElBQUlyVSxDQUFKLEdBQVFzVSxJQUFJdFUsQ0FBeEI7O0FBRUEsUUFBSTBMLE9BQU9qRyxLQUFLQyxJQUFMLENBQVdELEtBQUtFLEdBQUwsQ0FBVTRPLEtBQVYsRUFBaUIsQ0FBakIsSUFBdUI5TyxLQUFLRSxHQUFMLENBQVU2TyxLQUFWLEVBQWlCLENBQWpCLENBQWxDLENBQVg7QUFDQSxXQUFPOUksSUFBUDtBQUNELEdBbGpCd0I7QUFtakJ6QjtBQUNBa0ksd0JBQXNCLDhCQUFVYSxFQUFWLEVBQWNDLEVBQWQsRUFBK0Q7QUFBQSxRQUE3Q0MsaUJBQTZDLHVFQUF6QixLQUF5QjtBQUFBLFFBQWxCQyxTQUFrQix1RUFBTixJQUFNOztBQUNuRixRQUFNQyxPQUFPSixLQUFLQyxFQUFsQjtBQUNBLFFBQUlqUCxLQUFLcVAsR0FBTCxDQUFTRCxJQUFULEtBQWtCRCxTQUF0QixFQUFpQztBQUMvQixhQUFPLElBQVA7QUFDRDtBQUNELFFBQUlELGlCQUFKLEVBQXVCO0FBQ3JCLGFBQU9GLEtBQUtDLEVBQVo7QUFDRCxLQUZELE1BRU87QUFDTCxhQUFPRCxLQUFLQyxFQUFaO0FBQ0Q7QUFDRixHQTlqQndCO0FBK2pCekJyVCw4QkFBNEIsb0NBQVM3RCxJQUFULEVBQWV1WCxLQUFmLEVBQXFCO0FBQy9DLFFBQUd2WCxTQUFTLE1BQVosRUFBb0I7QUFDbEJ3WCxjQUFRQyxHQUFSLFNBQWtCRixLQUFsQjtBQUNBLGFBQU8sSUFBUDtBQUNEO0FBQ0QsV0FBTyxLQUFQO0FBQ0Q7QUFya0J3QixDQUEzQjs7QUF3a0JBdGMsT0FBT0MsT0FBUCxHQUFpQkwsb0JBQWpCLEM7Ozs7Ozs7Ozs7O0FDeGtCQSxJQUFJRixXQUFZLFlBQVk7QUFDMUI7Ozs7Ozs7O0FBUUE7QUFDQSxNQUFJK2Msa0JBQWtCLHFCQUF0Qjs7QUFFQTtBQUNBLE1BQUlDLFlBQVkxUCxLQUFLMlAsR0FBckI7QUFBQSxNQUNRQyxZQUFZQyxLQUFLQyxHQUR6Qjs7QUFHQTs7Ozs7Ozs7Ozs7Ozs7QUFjQSxNQUFJQSxNQUFNRixhQUFhLFlBQVk7QUFDakMsV0FBTyxJQUFJQyxJQUFKLEdBQVdFLE9BQVgsRUFBUDtBQUNELEdBRkQ7O0FBSUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQStEQSxXQUFTcmQsUUFBVCxDQUFrQnNkLElBQWxCLEVBQXdCQyxJQUF4QixFQUE4QjVjLE9BQTlCLEVBQXVDO0FBQ3JDLFFBQUk2YyxJQUFKO0FBQUEsUUFDUUMsWUFEUjtBQUFBLFFBRVEzTCxNQUZSO0FBQUEsUUFHUTRMLEtBSFI7QUFBQSxRQUlRQyxPQUpSO0FBQUEsUUFLUUMsU0FMUjtBQUFBLFFBTVFDLFlBTlI7QUFBQSxRQU9RQyxhQUFhLENBUHJCO0FBQUEsUUFRUUMsVUFBVSxLQVJsQjtBQUFBLFFBU1FDLFdBQVcsSUFUbkI7O0FBV0EsUUFBSSxPQUFPVixJQUFQLElBQWUsVUFBbkIsRUFBK0I7QUFDN0IsWUFBTSxJQUFJVyxTQUFKLENBQWNsQixlQUFkLENBQU47QUFDRDtBQUNEUSxXQUFPQSxPQUFPLENBQVAsR0FBVyxDQUFYLEdBQWdCLENBQUNBLElBQUQsSUFBUyxDQUFoQztBQUNBLFFBQUk1YyxZQUFZLElBQWhCLEVBQXNCO0FBQ3BCLFVBQUl1ZCxVQUFVLElBQWQ7QUFDQUYsaUJBQVcsS0FBWDtBQUNELEtBSEQsTUFHTyxJQUFJRyxTQUFTeGQsT0FBVCxDQUFKLEVBQXVCO0FBQzVCdWQsZ0JBQVUsQ0FBQyxDQUFDdmQsUUFBUXVkLE9BQXBCO0FBQ0FILGdCQUFVLGFBQWFwZCxPQUFiLElBQXdCcWMsVUFBVSxDQUFDcmMsUUFBUW9kLE9BQVQsSUFBb0IsQ0FBOUIsRUFBaUNSLElBQWpDLENBQWxDO0FBQ0FTLGlCQUFXLGNBQWNyZCxPQUFkLEdBQXdCLENBQUMsQ0FBQ0EsUUFBUXFkLFFBQWxDLEdBQTZDQSxRQUF4RDtBQUNEOztBQUVELGFBQVNJLE1BQVQsR0FBa0I7QUFDaEIsVUFBSVIsU0FBSixFQUFlO0FBQ2JTLHFCQUFhVCxTQUFiO0FBQ0Q7QUFDRCxVQUFJSCxZQUFKLEVBQWtCO0FBQ2hCWSxxQkFBYVosWUFBYjtBQUNEO0FBQ0RLLG1CQUFhLENBQWI7QUFDQUwscUJBQWVHLFlBQVlDLGVBQWUzWixTQUExQztBQUNEOztBQUVELGFBQVNvYSxRQUFULENBQWtCQyxRQUFsQixFQUE0Qi9hLEVBQTVCLEVBQWdDO0FBQzlCLFVBQUlBLEVBQUosRUFBUTtBQUNONmEscUJBQWE3YSxFQUFiO0FBQ0Q7QUFDRGlhLHFCQUFlRyxZQUFZQyxlQUFlM1osU0FBMUM7QUFDQSxVQUFJcWEsUUFBSixFQUFjO0FBQ1pULHFCQUFhVixLQUFiO0FBQ0F0TCxpQkFBU3dMLEtBQUtwRyxLQUFMLENBQVd5RyxPQUFYLEVBQW9CSCxJQUFwQixDQUFUO0FBQ0EsWUFBSSxDQUFDSSxTQUFELElBQWMsQ0FBQ0gsWUFBbkIsRUFBaUM7QUFDL0JELGlCQUFPRyxVQUFVelosU0FBakI7QUFDRDtBQUNGO0FBQ0Y7O0FBRUQsYUFBU3NhLE9BQVQsR0FBbUI7QUFDakIsVUFBSUMsWUFBWWxCLFFBQVFILFFBQVFNLEtBQWhCLENBQWhCO0FBQ0EsVUFBSWUsYUFBYSxDQUFiLElBQWtCQSxZQUFZbEIsSUFBbEMsRUFBd0M7QUFDdENlLGlCQUFTVCxZQUFULEVBQXVCSixZQUF2QjtBQUNELE9BRkQsTUFFTztBQUNMRyxvQkFBWXhVLFdBQVdvVixPQUFYLEVBQW9CQyxTQUFwQixDQUFaO0FBQ0Q7QUFDRjs7QUFFRCxhQUFTQyxVQUFULEdBQXNCO0FBQ3BCSixlQUFTTixRQUFULEVBQW1CSixTQUFuQjtBQUNEOztBQUVELGFBQVNlLFNBQVQsR0FBcUI7QUFDbkJuQixhQUFPakcsU0FBUDtBQUNBbUcsY0FBUU4sS0FBUjtBQUNBTyxnQkFBVSxJQUFWO0FBQ0FFLHFCQUFlRyxhQUFhSixhQUFhLENBQUNNLE9BQTNCLENBQWY7O0FBRUEsVUFBSUgsWUFBWSxLQUFoQixFQUF1QjtBQUNyQixZQUFJYSxjQUFjVixXQUFXLENBQUNOLFNBQTlCO0FBQ0QsT0FGRCxNQUVPO0FBQ0wsWUFBSSxDQUFDSCxZQUFELElBQWlCLENBQUNTLE9BQXRCLEVBQStCO0FBQzdCSix1QkFBYUosS0FBYjtBQUNEO0FBQ0QsWUFBSWUsWUFBWVYsV0FBV0wsUUFBUUksVUFBbkIsQ0FBaEI7QUFBQSxZQUNRUyxXQUFXRSxhQUFhLENBQWIsSUFBa0JBLFlBQVlWLE9BRGpEOztBQUdBLFlBQUlRLFFBQUosRUFBYztBQUNaLGNBQUlkLFlBQUosRUFBa0I7QUFDaEJBLDJCQUFlWSxhQUFhWixZQUFiLENBQWY7QUFDRDtBQUNESyx1QkFBYUosS0FBYjtBQUNBNUwsbUJBQVN3TCxLQUFLcEcsS0FBTCxDQUFXeUcsT0FBWCxFQUFvQkgsSUFBcEIsQ0FBVDtBQUNELFNBTkQsTUFPSyxJQUFJLENBQUNDLFlBQUwsRUFBbUI7QUFDdEJBLHlCQUFlclUsV0FBV3NWLFVBQVgsRUFBdUJELFNBQXZCLENBQWY7QUFDRDtBQUNGO0FBQ0QsVUFBSUYsWUFBWVgsU0FBaEIsRUFBMkI7QUFDekJBLG9CQUFZUyxhQUFhVCxTQUFiLENBQVo7QUFDRCxPQUZELE1BR0ssSUFBSSxDQUFDQSxTQUFELElBQWNMLFNBQVNRLE9BQTNCLEVBQW9DO0FBQ3ZDSCxvQkFBWXhVLFdBQVdvVixPQUFYLEVBQW9CakIsSUFBcEIsQ0FBWjtBQUNEO0FBQ0QsVUFBSXFCLFdBQUosRUFBaUI7QUFDZkwsbUJBQVcsSUFBWDtBQUNBek0saUJBQVN3TCxLQUFLcEcsS0FBTCxDQUFXeUcsT0FBWCxFQUFvQkgsSUFBcEIsQ0FBVDtBQUNEO0FBQ0QsVUFBSWUsWUFBWSxDQUFDWCxTQUFiLElBQTBCLENBQUNILFlBQS9CLEVBQTZDO0FBQzNDRCxlQUFPRyxVQUFVelosU0FBakI7QUFDRDtBQUNELGFBQU80TixNQUFQO0FBQ0Q7O0FBRUQ2TSxjQUFVUCxNQUFWLEdBQW1CQSxNQUFuQjtBQUNBLFdBQU9PLFNBQVA7QUFDRDs7QUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFvQkEsV0FBU1IsUUFBVCxDQUFrQjdPLEtBQWxCLEVBQXlCO0FBQ3ZCO0FBQ0E7QUFDQSxRQUFJakssY0FBY2lLLEtBQWQseUNBQWNBLEtBQWQsQ0FBSjtBQUNBLFdBQU8sQ0FBQyxDQUFDQSxLQUFGLEtBQVlqSyxRQUFRLFFBQVIsSUFBb0JBLFFBQVEsVUFBeEMsQ0FBUDtBQUNEOztBQUVELFNBQU9yRixRQUFQO0FBRUQsQ0EzT2MsRUFBZjs7QUE2T0FNLE9BQU9DLE9BQVAsR0FBaUJQLFFBQWpCLEM7Ozs7Ozs7OztBQzdPQSxDQUFFLENBQUMsWUFBWTtBQUNiOztBQUVBLE1BQUlFLHVCQUF1QkQsbUJBQU9BLENBQUMsR0FBUixDQUEzQjtBQUNBLE1BQUlELFdBQVdDLG1CQUFPQSxDQUFDLEdBQVIsQ0FBZjs7QUFFQTtBQUNBLE1BQUk0ZSxXQUFXLFNBQVhBLFFBQVcsQ0FBVUMsU0FBVixFQUFxQmhjLENBQXJCLEVBQXdCTyxLQUF4QixFQUErQjtBQUM1QyxRQUFJMGIsY0FBYzllLG1CQUFPQSxDQUFDLEdBQVIsQ0FBbEI7O0FBRUEsUUFBSSxDQUFDNmUsU0FBRCxJQUFjLENBQUNoYyxDQUFmLElBQW9CLENBQUNPLEtBQXpCLEVBQWdDO0FBQUU7QUFBUyxLQUhDLENBR0E7O0FBRTVDLFFBQUkyYixXQUFXO0FBQ2I7QUFDQWhQLDZCQUF1QiwrQkFBVWlQLEdBQVYsRUFBZTtBQUNwQyxlQUFPQSxJQUFJMVosSUFBSixDQUFTLG9CQUFULENBQVA7QUFDRCxPQUpZO0FBS2I7QUFDQTBLLGdDQUEwQixrQ0FBVWdQLEdBQVYsRUFBZTtBQUN2QyxlQUFPQSxJQUFJMVosSUFBSixDQUFTLHVCQUFULENBQVA7QUFDRCxPQVJZO0FBU2I7QUFDQXNLLHdDQUFrQywwQ0FBVW9QLEdBQVYsRUFBZUMsa0JBQWYsRUFBbUM7QUFDbkVELFlBQUkxWixJQUFKLENBQVMsb0JBQVQsRUFBK0IyWixrQkFBL0I7QUFDRCxPQVpZO0FBYWI7QUFDQXBQLDJDQUFxQyw2Q0FBVW1QLEdBQVYsRUFBZUUscUJBQWYsRUFBc0M7QUFDekVGLFlBQUkxWixJQUFKLENBQVMsdUJBQVQsRUFBa0M0WixxQkFBbEM7QUFDRCxPQWhCWTtBQWlCYjtBQUNBQyxnQ0FBMEIsSUFsQmI7QUFtQmI7QUFDQTNILHNCQUFnQixFQXBCSDtBQXFCYjtBQUNBNU8sZ0JBQVUsS0F0Qkc7QUF1QmI7QUFDQW9GLDZCQUF1QixDQXhCVjtBQXlCYjtBQUNBbEQsY0FBUSxHQTFCSztBQTJCYjtBQUNBeUksOEJBQXdCLENBNUJYO0FBNkJiO0FBQ0E1Siw0QkFBc0IsZ0JBOUJUO0FBK0JiO0FBQ0FLLCtCQUF5QixtQkFoQ1o7QUFpQ2I7QUFDQUMsa0NBQTRCLHdCQWxDZjtBQW1DYjtBQUNBRSwrQkFBeUIsbUJBcENaO0FBcUNiO0FBQ0FFLGtDQUE0QixzQkF0Q2Y7QUF1Q2I7QUFDQUMscUNBQStCLDJCQXhDbEI7QUF5Q2I7QUFDQXVMLHNDQUFnQywwQ0FBWTtBQUMxQyxlQUFPLElBQVA7QUFDRCxPQTVDWTtBQTZDYjtBQUNBM0wseUNBQW1DLEtBOUN0QjtBQStDYjtBQUNBSCxrREFBNEMsS0FoRC9CO0FBaURiO0FBQ0FpSSxnQ0FBMEI7QUFsRGIsS0FBZjs7QUFxREEsUUFBSXRSLE9BQUo7QUFDQSxRQUFJMGUsY0FBYyxLQUFsQjs7QUFFQTtBQUNBLGFBQVNDLE1BQVQsQ0FBZ0JOLFFBQWhCLEVBQTBCcmUsT0FBMUIsRUFBbUM7QUFDakMsVUFBSTRlLE1BQU0sRUFBVjs7QUFFQSxXQUFLLElBQUlwWSxDQUFULElBQWM2WCxRQUFkLEVBQXdCO0FBQ3RCTyxZQUFJcFksQ0FBSixJQUFTNlgsU0FBUzdYLENBQVQsQ0FBVDtBQUNEOztBQUVELFdBQUssSUFBSUEsQ0FBVCxJQUFjeEcsT0FBZCxFQUF1QjtBQUNyQjtBQUNBLFlBQUl3RyxLQUFLLHdCQUFULEVBQW1DO0FBQ2pDLGNBQUltSSxRQUFRM08sUUFBUXdHLENBQVIsQ0FBWjtBQUNBLGNBQUksQ0FBQ3FZLE1BQU1sUSxLQUFOLENBQUwsRUFBbUI7QUFDakIsZ0JBQUlBLFNBQVMsQ0FBVCxJQUFjQSxTQUFTLEVBQTNCLEVBQStCO0FBQzdCaVEsa0JBQUlwWSxDQUFKLElBQVN4RyxRQUFRd0csQ0FBUixDQUFUO0FBQ0QsYUFGRCxNQUVPLElBQUltSSxRQUFRLENBQVosRUFBZTtBQUNwQmlRLGtCQUFJcFksQ0FBSixJQUFTLENBQVQ7QUFDRCxhQUZNLE1BRUE7QUFDTG9ZLGtCQUFJcFksQ0FBSixJQUFTLEVBQVQ7QUFDRDtBQUNGO0FBQ0YsU0FYRCxNQVdPO0FBQ0xvWSxjQUFJcFksQ0FBSixJQUFTeEcsUUFBUXdHLENBQVIsQ0FBVDtBQUNEO0FBRUY7O0FBRUQsYUFBT29ZLEdBQVA7QUFDRDs7QUFFRFQsY0FBVSxNQUFWLEVBQWtCLGFBQWxCLEVBQWlDLFVBQVVsYyxJQUFWLEVBQWdCO0FBQy9DLFVBQUluQyxLQUFLLElBQVQ7O0FBRUEsVUFBSW1DLFNBQVMsYUFBYixFQUE0QjtBQUMxQixlQUFPeWMsV0FBUDtBQUNEOztBQUVELFVBQUl6YyxTQUFTLEtBQWIsRUFBb0I7QUFDbEI7QUFDQWpDLGtCQUFVMmUsT0FBT04sUUFBUCxFQUFpQnBjLElBQWpCLENBQVY7QUFDQXljLHNCQUFjLElBQWQ7O0FBRUE7QUFDQTVlLFdBQUcyTyxLQUFILEdBQVd2RixRQUFYLENBQW9CLGdDQUFwQixFQUFzRGlCLEdBQXRELENBQTBEO0FBQ3hELHlCQUFlLFVBRHlDO0FBRXhELCtCQUFxQiwwQkFBVW1VLEdBQVYsRUFBZTtBQUNsQyxtQkFBTy9lLHFCQUFxQndhLGtCQUFyQixDQUF3Q3VFLEdBQXhDLEVBQTZDLE1BQTdDLENBQVA7QUFDRCxXQUp1RDtBQUt4RCw2QkFBbUIsd0JBQVVBLEdBQVYsRUFBZTtBQUNoQyxtQkFBTy9lLHFCQUFxQjBhLGdCQUFyQixDQUFzQ3FFLEdBQXRDLEVBQTJDLE1BQTNDLENBQVA7QUFDRCxXQVB1RDtBQVF4RCw0QkFBa0I7QUFSc0MsU0FBMUQ7O0FBV0E7QUFDQXhlLFdBQUcyTyxLQUFILEdBQVd2RixRQUFYLENBQW9CLHNDQUFwQixFQUE0RGlCLEdBQTVELENBQWdFO0FBQzlELHlCQUFlLGtCQUQrQztBQUU5RCxxQ0FBMkIsK0JBQVVtVSxHQUFWLEVBQWU7QUFDeEMsbUJBQU8vZSxxQkFBcUJ3YSxrQkFBckIsQ0FBd0N1RSxHQUF4QyxFQUE2QyxTQUE3QyxDQUFQO0FBQ0QsV0FKNkQ7QUFLOUQsbUNBQXlCLDZCQUFVQSxHQUFWLEVBQWU7QUFDdEMsbUJBQU8vZSxxQkFBcUIwYSxnQkFBckIsQ0FBc0NxRSxHQUF0QyxFQUEyQyxTQUEzQyxDQUFQO0FBQ0QsV0FQNkQ7QUFROUQsNEJBQWtCO0FBUjRDLFNBQWhFOztBQVdBeGUsV0FBRzJPLEtBQUgsR0FBV3ZGLFFBQVgsQ0FBb0IsMEJBQXBCLEVBQWdEaUIsR0FBaEQsQ0FBb0Q7QUFDbEQsbUJBQVMsR0FEeUM7QUFFbEQsb0JBQVUsR0FGd0M7QUFHbEQsd0JBQWM7QUFIb0MsU0FBcEQ7O0FBTUE1Syw2QkFBcUJ3WCxpQkFBckIsQ0FBdUMvVyxRQUFROFcsY0FBL0M7O0FBRUE7QUFDQSxZQUFJOVcsUUFBUXllLHdCQUFaLEVBQXNDO0FBQ3BDO0FBQ0FsZiwrQkFBcUI2UCxnQkFBckIsQ0FBc0NwUCxRQUFRcVAscUJBQTlDLEVBQXFFclAsUUFBUXNQLHdCQUE3RSxFQUF1R3hQLEdBQUdpUCxLQUFILEVBQXZHLEVBQW1IL08sUUFBUThXLGNBQTNIO0FBQ0Q7O0FBRURzSCxvQkFBWXBlLE9BQVosRUFBcUJGLEVBQXJCO0FBQ0Q7O0FBRUQsVUFBSWdmLFdBQVdKLGNBQWM7QUFDM0I7Ozs7O0FBS0F4WSwyQkFBbUIsMkJBQVVvWSxHQUFWLEVBQWU7QUFDaEMsaUJBQU8vZSxxQkFBcUIyRyxpQkFBckIsQ0FBdUNvWSxHQUF2QyxDQUFQO0FBQ0QsU0FSMEI7QUFTM0I7QUFDQWxQLDBCQUFrQiwwQkFBVTJQLElBQVYsRUFBZ0I7QUFDaEN4ZiwrQkFBcUI2UCxnQkFBckIsQ0FBc0NwUCxRQUFRcVAscUJBQTlDLEVBQXFFclAsUUFBUXNQLHdCQUE3RSxFQUF1R3lQLElBQXZHO0FBQ0QsU0FaMEI7QUFhM0JDLDhCQUFzQiw4QkFBVVYsR0FBVixFQUFlMVksS0FBZixFQUFzQjtBQUMxQ3JHLCtCQUFxQmlKLFlBQXJCLENBQWtDOFYsR0FBbEMsRUFBdUMxWSxLQUF2QztBQUNELFNBZjBCO0FBZ0IzQkcscUJBQWEscUJBQVV1WSxHQUFWLEVBQWU7QUFDMUIsaUJBQU8vZSxxQkFBcUJ3RyxXQUFyQixDQUFpQ3VZLEdBQWpDLENBQVA7QUFDRDtBQWxCMEIsT0FBZCxHQW1CWC9hLFNBbkJKOztBQXFCQSxhQUFPdWIsUUFBUCxDQTFFK0MsQ0EwRTlCO0FBQ2xCLEtBM0VEO0FBNEVELEdBdktEOztBQXlLQVgsWUFBVSxNQUFWLEVBQWtCLG9CQUFsQixFQUF3QyxVQUFVbGMsSUFBVixFQUFnQjtBQUN0RCxRQUFJbkMsS0FBSyxJQUFUOztBQU1BO0FBQ0FBLE9BQUcyTyxLQUFILEdBQVd2RixRQUFYLENBQW9CLGdDQUFwQixFQUFzRGlCLEdBQXRELENBQTBEO0FBQ3hELHFCQUFlLFVBRHlDO0FBRXhELDJCQUFxQiwwQkFBVW1VLEdBQVYsRUFBZTtBQUNsQyxlQUFPL2UscUJBQXFCd2Esa0JBQXJCLENBQXdDdUUsR0FBeEMsRUFBNkMsTUFBN0MsQ0FBUDtBQUNELE9BSnVEO0FBS3hELHlCQUFtQix3QkFBVUEsR0FBVixFQUFlO0FBQ2hDLGVBQU8vZSxxQkFBcUIwYSxnQkFBckIsQ0FBc0NxRSxHQUF0QyxFQUEyQyxNQUEzQyxDQUFQO0FBQ0QsT0FQdUQ7QUFReEQsd0JBQWtCO0FBUnNDLEtBQTFEOztBQVdBO0FBQ0F4ZSxPQUFHMk8sS0FBSCxHQUFXdkYsUUFBWCxDQUFvQixzQ0FBcEIsRUFBNERpQixHQUE1RCxDQUFnRTtBQUM5RCxxQkFBZSxrQkFEK0M7QUFFOUQsaUNBQTJCLCtCQUFVbVUsR0FBVixFQUFlO0FBQ3hDLGVBQU8vZSxxQkFBcUJ3YSxrQkFBckIsQ0FBd0N1RSxHQUF4QyxFQUE2QyxTQUE3QyxDQUFQO0FBQ0QsT0FKNkQ7QUFLOUQsK0JBQXlCLDZCQUFVQSxHQUFWLEVBQWU7QUFDdEMsZUFBTy9lLHFCQUFxQjBhLGdCQUFyQixDQUFzQ3FFLEdBQXRDLEVBQTJDLFNBQTNDLENBQVA7QUFDRCxPQVA2RDtBQVE5RCx3QkFBa0I7QUFSNEMsS0FBaEU7O0FBV0F4ZSxPQUFHMk8sS0FBSCxHQUFXdkYsUUFBWCxDQUFvQiwwQkFBcEIsRUFBZ0RpQixHQUFoRCxDQUFvRDtBQUNsRCxlQUFTLEdBRHlDO0FBRWxELGdCQUFVLEdBRndDO0FBR2xELG9CQUFjO0FBSG9DLEtBQXBEOztBQU9BLFdBQU8yVSxRQUFQLENBdENzRCxDQXNDckM7QUFDbEIsR0F2Q0Q7O0FBMkNBLE1BQUksU0FBaUNuZixPQUFPQyxPQUE1QyxFQUFxRDtBQUFFO0FBQ3JERCxXQUFPQyxPQUFQLEdBQWlCc2UsUUFBakI7QUFDRDs7QUFFRCxNQUFJLElBQUosRUFBaUQ7QUFBRTtBQUNqRGUsdUNBQWlDLFlBQVk7QUFDM0MsYUFBT2YsUUFBUDtBQUNELEtBRkQ7QUFBQTtBQUdEOztBQUVELE1BQUksT0FBT0MsU0FBUCxLQUFxQixXQUFyQixJQUFvQ2hjLENBQXBDLElBQXlDTyxLQUE3QyxFQUFvRDtBQUFFO0FBQ3BEd2IsYUFBU0MsU0FBVCxFQUFvQmhjLENBQXBCLEVBQXVCTyxLQUF2QjtBQUNEO0FBRUYsQ0F6T0MsSTs7Ozs7Ozs7O0FDQUYsSUFBSWxELHdCQUF3Qjs7QUFFeEI7QUFDQTRSLG9CQUFnQix3QkFBVTlOLElBQVYsRUFBZ0J4RCxFQUFoQixFQUFvQndHLFFBQXBCLEVBQThCNEssZUFBOUIsRUFBK0M7O0FBRTNELFlBQUlSLFlBQVk7QUFDWjlMLGtCQUFNO0FBQ0ovQixvQkFBSSx5QkFEQTtBQUVKcWMsdUJBQU87QUFGSCxhQURNO0FBS1o3Tiw4QkFBa0IvSztBQUxOLFNBQWhCO0FBT0F4RyxXQUFHc0QsR0FBSCxDQUFPc04sU0FBUDs7QUFFQSxZQUFJK0MsTUFBT3ZDLG9CQUFvQixRQUFyQixHQUNOLEVBQUM3SyxRQUFRcUssVUFBVTlMLElBQVYsQ0FBZS9CLEVBQXhCLEVBRE0sR0FFTixFQUFDdUIsUUFBUXNNLFVBQVU5TCxJQUFWLENBQWUvQixFQUF4QixFQUZKOztBQUlBUyxlQUFPQSxLQUFLNmIsSUFBTCxDQUFVMUwsR0FBVixFQUFlLENBQWYsQ0FBUDs7QUFFQSxlQUFPO0FBQ0gvQyx1QkFBVzVRLEdBQUdzZixLQUFILENBQVMsTUFBTTFPLFVBQVU5TCxJQUFWLENBQWUvQixFQUE5QixFQUFrQyxDQUFsQyxDQURSO0FBRUhTLGtCQUFNQTtBQUZILFNBQVA7QUFJSCxLQXhCdUI7O0FBMEJ4QjZQLGlCQUFhLHFCQUFVN1AsSUFBVixFQUFnQitiLElBQWhCLEVBQXNCck0sUUFBdEIsRUFBZ0M7QUFDekMsWUFBRyxDQUFDMVAsS0FBS2dSLE1BQUwsRUFBRCxJQUFrQixDQUFDK0ssS0FBSzdOLE1BQUwsRUFBdEIsRUFDSTs7QUFFSixZQUFJaUMsTUFBTSxFQUFWO0FBQ0EsWUFBR1QsYUFBYSxRQUFoQixFQUNJUyxJQUFJcE4sTUFBSixHQUFhZ1osS0FBS3hjLEVBQUwsRUFBYixDQURKLEtBR0ssSUFBR21RLGFBQWEsUUFBaEIsRUFDRFMsSUFBSXJQLE1BQUosR0FBYWliLEtBQUt4YyxFQUFMLEVBQWIsQ0FEQyxLQUlEOztBQUVKLGVBQU9TLEtBQUs2YixJQUFMLENBQVUxTCxHQUFWLEVBQWUsQ0FBZixDQUFQO0FBQ0gsS0F6Q3VCOztBQTJDeEJKLGNBQVUsa0JBQVVFLE9BQVYsRUFBbUJELE9BQW5CLEVBQTRCO0FBQ2xDLGFBQUtnTSxXQUFMLENBQWlCL0wsT0FBakIsRUFBMEJELE9BQTFCO0FBQ0EsYUFBS2lNLFNBQUwsQ0FBZWhNLE9BQWYsRUFBd0JELE9BQXhCO0FBQ0gsS0E5Q3VCOztBQWdEeEJpTSxlQUFXLG1CQUFVaE0sT0FBVixFQUFtQkQsT0FBbkIsRUFBNEI7QUFDbkMsWUFBR0MsV0FBV0QsT0FBZCxFQUFzQjtBQUNsQkEsb0JBQVExTyxJQUFSLENBQWEsWUFBYixFQUEyQjJPLFFBQVEzTyxJQUFSLENBQWEsWUFBYixDQUEzQjtBQUNBME8sb0JBQVExTyxJQUFSLENBQWEsT0FBYixFQUFzQjJPLFFBQVEzTyxJQUFSLENBQWEsT0FBYixDQUF0QjtBQUNBME8sb0JBQVExTyxJQUFSLENBQWEsYUFBYixFQUE0QjJPLFFBQVEzTyxJQUFSLENBQWEsYUFBYixDQUE1QjtBQUNIO0FBQ0osS0F0RHVCOztBQXdEeEIwYSxpQkFBYSxxQkFBVS9MLE9BQVYsRUFBbUJELE9BQW5CLEVBQTRCO0FBQ3JDLFlBQUdDLFFBQVF2TixRQUFSLENBQWlCLCtCQUFqQixDQUFILEVBQXFEO0FBQ2pELGdCQUFJd1osY0FBY2pNLFFBQVEzTyxJQUFSLENBQWEsNEJBQWIsQ0FBbEI7QUFDQSxnQkFBSTZhLFlBQVlsTSxRQUFRM08sSUFBUixDQUFhLDBCQUFiLENBQWhCOztBQUVBME8sb0JBQVExTyxJQUFSLENBQWEsNEJBQWIsRUFBMkM0YSxXQUEzQztBQUNBbE0sb0JBQVExTyxJQUFSLENBQWEsMEJBQWIsRUFBeUM2YSxTQUF6QztBQUNBbk0sb0JBQVFwRCxRQUFSLENBQWlCLCtCQUFqQjtBQUNILFNBUEQsTUFRSyxJQUFHcUQsUUFBUXZOLFFBQVIsQ0FBaUIscUNBQWpCLENBQUgsRUFBMkQ7QUFDNUQsZ0JBQUl3WixjQUFjak0sUUFBUTNPLElBQVIsQ0FBYSwrQkFBYixDQUFsQjtBQUNBLGdCQUFJNmEsWUFBWWxNLFFBQVEzTyxJQUFSLENBQWEsNkJBQWIsQ0FBaEI7O0FBRUEwTyxvQkFBUTFPLElBQVIsQ0FBYSwrQkFBYixFQUE4QzRhLFdBQTlDO0FBQ0FsTSxvQkFBUTFPLElBQVIsQ0FBYSw2QkFBYixFQUE0QzZhLFNBQTVDO0FBQ0FuTSxvQkFBUXBELFFBQVIsQ0FBaUIscUNBQWpCO0FBQ0g7QUFDRCxZQUFJcUQsUUFBUXZOLFFBQVIsQ0FBaUIsdUNBQWpCLENBQUosRUFBK0Q7QUFDM0RzTixvQkFBUXBELFFBQVIsQ0FBaUIsdUNBQWpCO0FBQ0gsU0FGRCxNQUdLLElBQUlxRCxRQUFRdk4sUUFBUixDQUFpQiw2Q0FBakIsQ0FBSixFQUFxRTtBQUN0RXNOLG9CQUFRcEQsUUFBUixDQUFpQiw2Q0FBakI7QUFDSDtBQUNKO0FBL0V1QixDQUE1Qjs7QUFrRkF2USxPQUFPQyxPQUFQLEdBQWlCSixxQkFBakIsQzs7Ozs7Ozs7O0FDbEZBRyxPQUFPQyxPQUFQLEdBQWlCLFVBQVVFLEVBQVYsRUFBY1Asb0JBQWQsRUFBb0NNLE1BQXBDLEVBQTRDO0FBQzNELE1BQUlDLEdBQUdxSSxRQUFILElBQWUsSUFBbkIsRUFDRTs7QUFFRixNQUFJdVgsS0FBSzVmLEdBQUdxSSxRQUFILENBQVk7QUFDbkJ3WCxvQkFBZ0IsS0FERztBQUVuQkMsYUFBUztBQUZVLEdBQVosQ0FBVDs7QUFLQSxXQUFTQyxrQkFBVCxDQUE0QjdYLEtBQTVCLEVBQW1DO0FBQ2pDLFFBQUkxRSxPQUFPeEQsR0FBR2dnQixjQUFILENBQWtCOVgsTUFBTTFFLElBQU4sQ0FBV1QsRUFBWCxFQUFsQixDQUFYO0FBQ0EsUUFBSTZCLE9BQU9zRCxNQUFNdEQsSUFBTixLQUFlLE1BQWYsR0FBd0JzRCxNQUFNdEQsSUFBOUIsR0FBcUNuRixxQkFBcUJ3RyxXQUFyQixDQUFpQ3pDLElBQWpDLENBQWhEOztBQUVBLFFBQUlxQixPQUFKLEVBQWFHLFNBQWIsRUFBd0JSLFNBQXhCLEVBQW1DRSxXQUFuQzs7QUFFQSxRQUFHd0QsTUFBTXRELElBQU4sS0FBZSxNQUFmLElBQXlCLENBQUNzRCxNQUFNK1gsR0FBbkMsRUFBdUM7QUFDckNwYixnQkFBVSxFQUFWO0FBQ0FHLGtCQUFZLEVBQVo7QUFDRCxLQUhELE1BSUs7QUFDSFIsa0JBQVkvRSxxQkFBcUJnRixNQUFyQixDQUE0QkcsSUFBNUIsRUFBa0MsUUFBbEMsQ0FBWjtBQUNBRixvQkFBY2pGLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxVQUFsQyxDQUFkOztBQUVBQyxnQkFBVXFELE1BQU0rWCxHQUFOLEdBQVl6YyxLQUFLc0IsSUFBTCxDQUFVTixTQUFWLENBQVosR0FBbUMwRCxNQUFNckQsT0FBbkQ7QUFDQUcsa0JBQVlrRCxNQUFNK1gsR0FBTixHQUFZemMsS0FBS3NCLElBQUwsQ0FBVUosV0FBVixDQUFaLEdBQXFDd0QsTUFBTWxELFNBQXZEO0FBQ0Q7O0FBRUQsUUFBSXFNLFNBQVM7QUFDWDdOLFlBQU1BLElBREs7QUFFWG9CLFlBQU1BLElBRks7QUFHWEMsZUFBU0EsT0FIRTtBQUlYRyxpQkFBV0EsU0FKQTtBQUtYO0FBQ0FpYixXQUFLO0FBTk0sS0FBYjs7QUFTQTtBQUNBLFFBQUkvWCxNQUFNK1gsR0FBVixFQUFlOztBQUViLFVBQUlDLGlCQUFpQmhZLE1BQU1yRCxPQUFOLElBQWlCcUQsTUFBTXJELE9BQU4sQ0FBY3BDLE1BQWQsR0FBdUIsQ0FBN0Q7QUFDQSxVQUFJMGQsMEJBQTBCRCxrQkFBa0JoWSxNQUFNckQsT0FBTixDQUFjcEMsTUFBZCxHQUF1QixDQUF2RTs7QUFFQSxVQUFJeWQsY0FBSixFQUFvQjtBQUNsQjFjLGFBQUtzQixJQUFMLENBQVVOLFNBQVYsRUFBcUIwRCxNQUFNckQsT0FBM0I7QUFDQXJCLGFBQUtzQixJQUFMLENBQVVKLFdBQVYsRUFBdUJ3RCxNQUFNbEQsU0FBN0I7QUFDRDs7QUFFRCxVQUFJb2Isa0JBQWtCM2dCLHFCQUFxQmdGLE1BQXJCLENBQTRCRyxJQUE1QixFQUFrQyxPQUFsQyxDQUF0QjtBQUNBLFVBQUl5YixpQkFBaUI1Z0IscUJBQXFCZ0YsTUFBckIsQ0FBNEJHLElBQTVCLEVBQWtDLFlBQWxDLENBQXJCOztBQUVBO0FBQ0E7QUFDQTtBQUNBLFVBQUksQ0FBQ3NiLGNBQUQsSUFBbUIsQ0FBQ0MsdUJBQXhCLEVBQWlEO0FBQy9DO0FBQ0EzYyxhQUFLMk0sV0FBTCxDQUFpQmlRLGtCQUFrQixHQUFsQixHQUF3QkMsY0FBekM7QUFDRCxPQUhELE1BSUssSUFBSUgsa0JBQWtCLENBQUNDLHVCQUF2QixFQUFnRDtBQUFFO0FBQ3JEM2MsYUFBSzRNLFFBQUwsQ0FBY2dRLGVBQWQ7QUFDQTVjLGFBQUsyTSxXQUFMLENBQWlCa1EsY0FBakI7QUFDRCxPQUhJLE1BSUE7QUFDSDtBQUNBN2MsYUFBSzRNLFFBQUwsQ0FBY2dRLGtCQUFrQixHQUFsQixHQUF3QkMsY0FBdEM7QUFDRDs7QUFFRCxVQUFJLENBQUNILGNBQUwsRUFBcUI7QUFDbkIxYyxhQUFLc0IsSUFBTCxDQUFVTixTQUFWLEVBQXFCLEVBQXJCO0FBQ0FoQixhQUFLc0IsSUFBTCxDQUFVSixXQUFWLEVBQXVCLEVBQXZCO0FBQ0Q7O0FBRUQsVUFBSSxDQUFDbEIsS0FBS3lNLFFBQUwsRUFBTCxFQUNFek0sS0FBSytCLE1BQUwsR0FERixLQUVLO0FBQ0gvQixhQUFLZSxRQUFMO0FBQ0FmLGFBQUsrQixNQUFMO0FBQ0Q7QUFDRjs7QUFFRC9CLFNBQUtpTSxPQUFMLENBQWEsa0NBQWI7O0FBRUEsV0FBTzRCLE1BQVA7QUFDRDs7QUFFRCxXQUFTaVAsTUFBVCxDQUFnQkMsR0FBaEIsRUFBcUI7QUFDakIsUUFBSUEsSUFBSXBNLFNBQVIsRUFBbUI7QUFDZixhQUFPb00sSUFBSXBNLFNBQVg7QUFDQSxhQUFPb00sR0FBUDtBQUNIOztBQUVELFFBQUl0UixRQUFRc1IsSUFBSXRSLEtBQWhCO0FBQ0EsUUFBSUQsZUFBZXVSLElBQUl2UixZQUF2QjtBQUNBLFFBQUlxQyxTQUFTO0FBQ1RwQyxhQUFPQSxLQURFO0FBRVRELG9CQUFjO0FBQ1Y3SCxXQUFHLENBQUM2SCxhQUFhN0gsQ0FEUDtBQUVWQyxXQUFHLENBQUM0SCxhQUFhNUg7QUFGUDtBQUZMLEtBQWI7QUFPQW9aLHdCQUFvQnhSLFlBQXBCLEVBQWtDQyxLQUFsQzs7QUFFQSxXQUFPb0MsTUFBUDtBQUNIOztBQUVELFdBQVNtUCxtQkFBVCxDQUE2QnhSLFlBQTdCLEVBQTJDQyxLQUEzQyxFQUFrRDtBQUM5Q0EsVUFBTXBKLE9BQU4sQ0FBYyxVQUFVckMsSUFBVixFQUFnQjtBQUMxQixVQUFJb0IsT0FBT25GLHFCQUFxQndHLFdBQXJCLENBQWlDekMsSUFBakMsQ0FBWDtBQUNBLFVBQUkwTCwwQkFBMEJ6UCxxQkFBcUIyRyxpQkFBckIsQ0FBdUM1QyxJQUF2QyxDQUE5QjtBQUNBLFVBQUlpZCxzQkFBc0IsRUFBMUI7QUFDQSxVQUFJdlIsMkJBQTJCekwsU0FBL0IsRUFDQTtBQUNJLGFBQUssSUFBSWlELElBQUUsQ0FBWCxFQUFjQSxJQUFFd0ksd0JBQXdCek0sTUFBeEMsRUFBZ0RpRSxLQUFHLENBQW5ELEVBQ0E7QUFDSStaLDhCQUFvQjlZLElBQXBCLENBQXlCLEVBQUNSLEdBQUcrSCx3QkFBd0J4SSxDQUF4QixJQUEyQnNJLGFBQWE3SCxDQUE1QyxFQUErQ0MsR0FBRzhILHdCQUF3QnhJLElBQUUsQ0FBMUIsSUFBNkJzSSxhQUFhNUgsQ0FBNUYsRUFBekI7QUFDSDtBQUNELFlBQUl4QyxTQUFTLE1BQWIsRUFBcUI7QUFDbkI3RSxpQkFBT3FQLGdDQUFQLENBQXdDNUwsSUFBeEMsRUFBOENpZCxtQkFBOUM7QUFDRCxTQUZELE1BR0ssSUFBSTdiLFNBQVMsU0FBYixFQUF3QjtBQUMzQjdFLGlCQUFPc1AsbUNBQVAsQ0FBMkM3TCxJQUEzQyxFQUFpRGlkLG1CQUFqRDtBQUNEO0FBQ0o7QUFDSixLQWpCRDs7QUFtQkFoaEIseUJBQXFCNlAsZ0JBQXJCLENBQXNDdlAsT0FBT3dQLHFCQUE3QyxFQUFvRXhQLE9BQU95UCx3QkFBM0UsRUFBcUdQLEtBQXJHO0FBQ0g7O0FBRUQsV0FBU3lSLGFBQVQsQ0FBdUJ4WSxLQUF2QixFQUE2QjtBQUMzQixRQUFJMUUsT0FBWTBFLE1BQU0xRSxJQUF0QjtBQUNBLFFBQUkwUCxXQUFZaEwsTUFBTWdMLFFBQXRCO0FBQ0EsUUFBSVUsU0FBWTFMLE1BQU0wTCxNQUF0Qjs7QUFFQXBRLFdBQU9BLEtBQUs2YixJQUFMLENBQVVuTSxRQUFWLEVBQW9CLENBQXBCLENBQVA7O0FBRUEsUUFBSTdCLFNBQVM7QUFDWDdOLFlBQVVBLElBREM7QUFFWDBQLGdCQUFVVSxNQUZDO0FBR1hBLGNBQVVWO0FBSEMsS0FBYjtBQUtBMVAsU0FBS2UsUUFBTDtBQUNBLFdBQU84TSxNQUFQO0FBQ0Q7O0FBRUQsV0FBU3NQLHFCQUFULENBQStCelksS0FBL0IsRUFBcUM7QUFDbkMsUUFBSXVMLFVBQVV2TCxNQUFNdUwsT0FBcEI7QUFDQSxRQUFJbU4sTUFBTTVnQixHQUFHZ2dCLGNBQUgsQ0FBa0J2TSxRQUFRM08sSUFBUixDQUFhLElBQWIsQ0FBbEIsQ0FBVjtBQUNBLFFBQUc4YixPQUFPQSxJQUFJbmUsTUFBSixHQUFhLENBQXZCLEVBQ0VnUixVQUFVbU4sR0FBVjs7QUFFRixRQUFJcE4sVUFBVXRMLE1BQU1zTCxPQUFwQjtBQUNBLFFBQUlvTixNQUFNNWdCLEdBQUdnZ0IsY0FBSCxDQUFrQnhNLFFBQVExTyxJQUFSLENBQWEsSUFBYixDQUFsQixDQUFWO0FBQ0EsUUFBRzhiLE9BQU9BLElBQUluZSxNQUFKLEdBQWEsQ0FBdkIsRUFDRStRLFVBQVVvTixHQUFWOztBQUVGLFFBQUduTixRQUFReEYsTUFBUixFQUFILEVBQW9CO0FBQ2xCd0YsZ0JBQVVBLFFBQVFDLE1BQVIsR0FBaUIsQ0FBakIsQ0FBVjtBQUNEOztBQUVELFFBQUdGLFFBQVFxTixPQUFSLEVBQUgsRUFBcUI7QUFDbkJyTixnQkFBVUEsUUFBUXNOLE9BQVIsRUFBVjtBQUNBdE4sY0FBUWpQLFFBQVI7QUFDRDs7QUFFRCxXQUFPO0FBQ0xrUCxlQUFTRCxPQURKO0FBRUxBLGVBQVNDO0FBRkosS0FBUDtBQUlEOztBQUVEbU0sS0FBR21CLE1BQUgsQ0FBVSxvQkFBVixFQUFnQ2hCLGtCQUFoQyxFQUFvREEsa0JBQXBEO0FBQ0FILEtBQUdtQixNQUFILENBQVUsa0JBQVYsRUFBOEJULE1BQTlCLEVBQXNDQSxNQUF0QztBQUNBVixLQUFHbUIsTUFBSCxDQUFVLGVBQVYsRUFBMkJMLGFBQTNCLEVBQTBDQSxhQUExQztBQUNBZCxLQUFHbUIsTUFBSCxDQUFVLHVCQUFWLEVBQW1DSixxQkFBbkMsRUFBMERBLHFCQUExRDtBQUNELENBN0tELEM7Ozs7OztVQ0FBO1VBQ0E7O1VBRUE7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7O1VBRUE7VUFDQTs7VUFFQTtVQUNBO1VBQ0E7Ozs7VUN0QkE7VUFDQTtVQUNBO1VBQ0EiLCJmaWxlIjoiY3l0b3NjYXBlLWVkZ2UtZWRpdGluZy5qcyIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiB3ZWJwYWNrVW5pdmVyc2FsTW9kdWxlRGVmaW5pdGlvbihyb290LCBmYWN0b3J5KSB7XG5cdGlmKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0Jylcblx0XHRtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcblx0ZWxzZSBpZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpXG5cdFx0ZGVmaW5lKFtdLCBmYWN0b3J5KTtcblx0ZWxzZSBpZih0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpXG5cdFx0ZXhwb3J0c1tcImN5dG9zY2FwZUVkZ2VFZGl0aW5nXCJdID0gZmFjdG9yeSgpO1xuXHRlbHNlXG5cdFx0cm9vdFtcImN5dG9zY2FwZUVkZ2VFZGl0aW5nXCJdID0gZmFjdG9yeSgpO1xufSkoc2VsZiwgZnVuY3Rpb24oKSB7XG5yZXR1cm4gIiwidmFyIGRlYm91bmNlID0gcmVxdWlyZSgnLi9kZWJvdW5jZScpO1xudmFyIGFuY2hvclBvaW50VXRpbGl0aWVzID0gcmVxdWlyZSgnLi9hbmNob3JQb2ludFV0aWxpdGllcycpO1xudmFyIHJlY29ubmVjdGlvblV0aWxpdGllcyA9IHJlcXVpcmUoJy4vcmVjb25uZWN0aW9uVXRpbGl0aWVzJyk7XG52YXIgcmVnaXN0ZXJVbmRvUmVkb0Z1bmN0aW9ucyA9IHJlcXVpcmUoJy4vcmVnaXN0ZXJVbmRvUmVkb0Z1bmN0aW9ucycpO1xudmFyIHN0YWdlSWQgPSAwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwYXJhbXMsIGN5KSB7XG4gIHZhciBmbiA9IHBhcmFtcztcblxuICBhbmNob3JQb2ludFV0aWxpdGllcy5vcHRpb25zID0gcGFyYW1zO1xuXG4gIHZhciBhZGRCZW5kUG9pbnRDeHRNZW51SWQgPSAnY3ktZWRnZS1iZW5kLWVkaXRpbmctY3h0LWFkZC1iZW5kLXBvaW50JyArIHN0YWdlSWQ7XG4gIHZhciByZW1vdmVCZW5kUG9pbnRDeHRNZW51SWQgPSAnY3ktZWRnZS1iZW5kLWVkaXRpbmctY3h0LXJlbW92ZS1iZW5kLXBvaW50JyArIHN0YWdlSWQ7XG4gIHZhciByZW1vdmVBbGxCZW5kUG9pbnRDdHhNZW51SWQgPSAnY3ktZWRnZS1iZW5kLWVkaXRpbmctY3h0LXJlbW92ZS1tdWx0aXBsZS1iZW5kLXBvaW50JyArIHN0YWdlSWQ7XG4gIHZhciBhZGRDb250cm9sUG9pbnRDeHRNZW51SWQgPSAnY3ktZWRnZS1jb250cm9sLWVkaXRpbmctY3h0LWFkZC1jb250cm9sLXBvaW50JyArIHN0YWdlSWQ7XG4gIHZhciByZW1vdmVDb250cm9sUG9pbnRDeHRNZW51SWQgPSAnY3ktZWRnZS1jb250cm9sLWVkaXRpbmctY3h0LXJlbW92ZS1jb250cm9sLXBvaW50JyArIHN0YWdlSWQ7XG4gIHZhciByZW1vdmVBbGxDb250cm9sUG9pbnRDdHhNZW51SWQgPSAnY3ktZWRnZS1iZW5kLWVkaXRpbmctY3h0LXJlbW92ZS1tdWx0aXBsZS1jb250cm9sLXBvaW50JyArIHN0YWdlSWQ7XG4gIHZhciBlU3R5bGUsIGVSZW1vdmUsIGVBZGQsIGVab29tLCBlU2VsZWN0LCBlVW5zZWxlY3QsIGVUYXBTdGFydCwgZVRhcFN0YXJ0T25FZGdlLCBlVGFwRHJhZywgZVRhcEVuZCwgZUN4dFRhcCwgZURyYWcsIGVEYXRhO1xuICAvLyBsYXN0IHN0YXR1cyBvZiBnZXN0dXJlc1xuICB2YXIgbGFzdFBhbm5pbmdFbmFibGVkLCBsYXN0Wm9vbWluZ0VuYWJsZWQsIGxhc3RCb3hTZWxlY3Rpb25FbmFibGVkO1xuICB2YXIgbGFzdEFjdGl2ZUJnT3BhY2l0eTtcbiAgLy8gc3RhdHVzIG9mIGVkZ2UgdG8gaGlnaGxpZ2h0IGJlbmRzIGFuZCBzZWxlY3RlZCBlZGdlc1xuICB2YXIgZWRnZVRvSGlnaGxpZ2h0LCBudW1iZXJPZlNlbGVjdGVkRWRnZXM7XG5cbiAgLy8gdGhlIEthbnZhLnNoYXBlKCkgZm9yIHRoZSBlbmRwb2ludHNcbiAgdmFyIGVuZHBvaW50U2hhcGUxID0gbnVsbCwgZW5kcG9pbnRTaGFwZTIgPSBudWxsO1xuICAvLyB1c2VkIHRvIHN0b3AgY2VydGFpbiBjeSBsaXN0ZW5lcnMgd2hlbiBpbnRlcnJhY3Rpbmcgd2l0aCBhbmNob3JzXG4gIHZhciBhbmNob3JUb3VjaGVkID0gZmFsc2U7XG4gIC8vIHVzZWQgY2FsbCBlTW91c2VEb3duIG9mIGFuY2hvck1hbmFnZXIgaWYgdGhlIG1vdXNlIGlzIG91dCBvZiB0aGUgY29udGVudCBvbiBjeS5vbih0YXBlbmQpXG4gIHZhciBtb3VzZU91dDtcbiAgXG4gIHZhciBmdW5jdGlvbnMgPSB7XG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgLy8gcmVnaXN0ZXIgdW5kbyByZWRvIGZ1bmN0aW9uc1xuICAgICAgcmVnaXN0ZXJVbmRvUmVkb0Z1bmN0aW9ucyhjeSwgYW5jaG9yUG9pbnRVdGlsaXRpZXMsIHBhcmFtcyk7XG4gICAgICBcbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHZhciBvcHRzID0gcGFyYW1zO1xuXG4gICAgICAvKlxuICAgICAgICBNYWtlIHN1cmUgd2UgZG9uJ3QgYXBwZW5kIGFuIGVsZW1lbnQgdGhhdCBhbHJlYWR5IGV4aXN0cy5cbiAgICAgICAgVGhpcyBleHRlbnNpb24gY2FudmFzIHVzZXMgdGhlIHNhbWUgaHRtbCBlbGVtZW50IGFzIGVkZ2UtZWRpdGluZy5cbiAgICAgICAgSXQgbWFrZXMgc2Vuc2Ugc2luY2UgaXQgYWxzbyB1c2VzIHRoZSBzYW1lIEtvbnZhIHN0YWdlLlxuICAgICAgICBXaXRob3V0IHRoZSBiZWxvdyBsb2dpYywgYW4gZW1wdHkgY2FudmFzRWxlbWVudCB3b3VsZCBiZSBjcmVhdGVkXG4gICAgICAgIGZvciBvbmUgb2YgdGhlc2UgZXh0ZW5zaW9ucyBmb3Igbm8gcmVhc29uLlxuICAgICAgKi9cbiAgICAgIHZhciAkY29udGFpbmVyID0gJCh0aGlzKTtcbiAgICAgIHZhciBjYW52YXNFbGVtZW50SWQgPSAnY3ktbm9kZS1lZGdlLWVkaXRpbmctc3RhZ2UnICsgc3RhZ2VJZDtcbiAgICAgIHN0YWdlSWQrKztcbiAgICAgIHZhciAkY2FudmFzRWxlbWVudCA9ICQoJzxkaXYgaWQ9XCInICsgY2FudmFzRWxlbWVudElkICsgJ1wiPjwvZGl2PicpO1xuXG4gICAgICBpZiAoJGNvbnRhaW5lci5maW5kKCcjJyArIGNhbnZhc0VsZW1lbnRJZCkubGVuZ3RoIDwgMSkge1xuICAgICAgICAkY29udGFpbmVyLmFwcGVuZCgkY2FudmFzRWxlbWVudCk7XG4gICAgICB9XG5cbiAgICAgIC8qIFxuICAgICAgICBNYWludGFpbiBhIHNpbmdsZSBLb252YS5zdGFnZSBvYmplY3QgdGhyb3VnaG91dCB0aGUgYXBwbGljYXRpb24gdGhhdCB1c2VzIHRoaXMgZXh0ZW5zaW9uXG4gICAgICAgIHN1Y2ggYXMgTmV3dC4gVGhpcyBpcyBpbXBvcnRhbnQgc2luY2UgaGF2aW5nIGRpZmZlcmVudCBzdGFnZXMgY2F1c2VzIHdlaXJkIGJlaGF2aW9yXG4gICAgICAgIG9uIG90aGVyIGV4dGVuc2lvbnMgdGhhdCBhbHNvIHVzZSBLb252YSwgbGlrZSBub3QgbGlzdGVuaW5nIHRvIG1vdXNlIGNsaWNrcyBhbmQgc3VjaC5cbiAgICAgICAgSWYgeW91IGFyZSBzb21lb25lIHRoYXQgaXMgY3JlYXRpbmcgYW4gZXh0ZW5zaW9uIHRoYXQgdXNlcyBLb252YSBpbiB0aGUgZnV0dXJlLCB5b3UgbmVlZCB0b1xuICAgICAgICBiZSBjYXJlZnVsIGFib3V0IGhvdyBldmVudHMgcmVnaXN0ZXIuIElmIHlvdSB1c2UgYSBkaWZmZXJlbnQgc3RhZ2UgYWxtb3N0IGNlcnRhaW5seSBvbmVcbiAgICAgICAgb3IgYm90aCBvZiB0aGUgZXh0ZW5zaW9ucyB0aGF0IHVzZSB0aGUgc3RhZ2UgY3JlYXRlZCBiZWxvdyB3aWxsIGJyZWFrLlxuICAgICAgKi8gXG4gICAgICB2YXIgc3RhZ2U7XG4gICAgICBpZiAoS29udmEuc3RhZ2VzLmxlbmd0aCA8IHN0YWdlSWQpIHtcbiAgICAgICAgc3RhZ2UgPSBuZXcgS29udmEuU3RhZ2Uoe1xuICAgICAgICAgIGlkOiAnbm9kZS1lZGdlLWVkaXRpbmctc3RhZ2UnLFxuICAgICAgICAgIGNvbnRhaW5lcjogY2FudmFzRWxlbWVudElkLCAgIC8vIGlkIG9mIGNvbnRhaW5lciA8ZGl2PlxuICAgICAgICAgIHdpZHRoOiAkY29udGFpbmVyLndpZHRoKCksXG4gICAgICAgICAgaGVpZ2h0OiAkY29udGFpbmVyLmhlaWdodCgpXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHN0YWdlID0gS29udmEuc3RhZ2VzW3N0YWdlSWQgLSAxXTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdmFyIGNhbnZhcztcbiAgICAgIGlmIChzdGFnZS5nZXRDaGlsZHJlbigpLmxlbmd0aCA8IDEpIHtcbiAgICAgICAgY2FudmFzID0gbmV3IEtvbnZhLkxheWVyKCk7XG4gICAgICAgIHN0YWdlLmFkZChjYW52YXMpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGNhbnZhcyA9IHN0YWdlLmdldENoaWxkcmVuKClbMF07XG4gICAgICB9ICBcbiAgICAgIFxuICAgICAgdmFyIGFuY2hvck1hbmFnZXIgPSB7XG4gICAgICAgIGVkZ2U6IHVuZGVmaW5lZCxcbiAgICAgICAgZWRnZVR5cGU6ICdub25lJyxcbiAgICAgICAgYW5jaG9yczogW10sXG4gICAgICAgIC8vIHJlbWVtYmVycyB0aGUgdG91Y2hlZCBhbmNob3IgdG8gYXZvaWQgY2xlYXJpbmcgaXQgd2hlbiBkcmFnZ2luZyBoYXBwZW5zXG4gICAgICAgIHRvdWNoZWRBbmNob3I6IHVuZGVmaW5lZCxcbiAgICAgICAgLy8gcmVtZW1iZXJzIHRoZSBpbmRleCBvZiB0aGUgbW92aW5nIGFuY2hvclxuICAgICAgICB0b3VjaGVkQW5jaG9ySW5kZXg6IHVuZGVmaW5lZCxcbiAgICAgICAgYmluZExpc3RlbmVyczogZnVuY3Rpb24oYW5jaG9yKXtcbiAgICAgICAgICBhbmNob3Iub24oXCJtb3VzZWRvd24gdG91Y2hzdGFydFwiLCB0aGlzLmVNb3VzZURvd24pO1xuICAgICAgICB9LFxuICAgICAgICB1bmJpbmRMaXN0ZW5lcnM6IGZ1bmN0aW9uKGFuY2hvcil7XG4gICAgICAgICAgYW5jaG9yLm9mZihcIm1vdXNlZG93biB0b3VjaHN0YXJ0XCIsIHRoaXMuZU1vdXNlRG93bik7XG4gICAgICAgIH0sXG4gICAgICAgIC8vIGdldHMgdHJpZ2dlciBvbiBjbGlja2luZyBvbiBjb250ZXh0IG1lbnVzLCB3aGlsZSBjeSBsaXN0ZW5lcnMgZG9uJ3QgZ2V0IHRyaWdnZXJlZFxuICAgICAgICAvLyBpdCBjYW4gY2F1c2Ugd2VpcmQgYmVoYXZpb3VyIGlmIG5vdCBhd2FyZSBvZiB0aGlzXG4gICAgICAgIGVNb3VzZURvd246IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAvLyBhbmNob3JNYW5hZ2VyLmVkZ2UudW5zZWxlY3QoKSB3b24ndCB3b3JrIHNvbWV0aW1lcyBpZiB0aGlzIHdhc24ndCBoZXJlXG4gICAgICAgICAgY3kuYXV0b3Vuc2VsZWN0aWZ5KGZhbHNlKTtcblxuICAgICAgICAgIC8vIGVNb3VzZURvd24oc2V0KSAtPiB0YXBkcmFnKHVzZWQpIC0+IGVNb3VzZVVwKHJlc2V0KVxuICAgICAgICAgIGFuY2hvclRvdWNoZWQgPSB0cnVlO1xuICAgICAgICAgIGFuY2hvck1hbmFnZXIudG91Y2hlZEFuY2hvciA9IGV2ZW50LnRhcmdldDtcbiAgICAgICAgICBtb3VzZU91dCA9IGZhbHNlO1xuICAgICAgICAgIGFuY2hvck1hbmFnZXIuZWRnZS51bnNlbGVjdCgpO1xuXG4gICAgICAgICAgLy8gcmVtZW1iZXIgc3RhdGUgYmVmb3JlIGNoYW5naW5nXG4gICAgICAgICAgdmFyIHdlaWdodFN0ciA9IGFuY2hvclBvaW50VXRpbGl0aWVzLnN5bnRheFthbmNob3JNYW5hZ2VyLmVkZ2VUeXBlXVsnd2VpZ2h0J107XG4gICAgICAgICAgdmFyIGRpc3RhbmNlU3RyID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuc3ludGF4W2FuY2hvck1hbmFnZXIuZWRnZVR5cGVdWydkaXN0YW5jZSddO1xuXG4gICAgICAgICAgdmFyIGVkZ2UgPSBhbmNob3JNYW5hZ2VyLmVkZ2U7XG4gICAgICAgICAgbW92ZUFuY2hvclBhcmFtID0ge1xuICAgICAgICAgICAgZWRnZTogZWRnZSxcbiAgICAgICAgICAgIHR5cGU6IGFuY2hvck1hbmFnZXIuZWRnZVR5cGUsXG4gICAgICAgICAgICB3ZWlnaHRzOiBlZGdlLmRhdGEod2VpZ2h0U3RyKSA/IFtdLmNvbmNhdChlZGdlLmRhdGEod2VpZ2h0U3RyKSkgOiBbXSxcbiAgICAgICAgICAgIGRpc3RhbmNlczogZWRnZS5kYXRhKGRpc3RhbmNlU3RyKSA/IFtdLmNvbmNhdChlZGdlLmRhdGEoZGlzdGFuY2VTdHIpKSA6IFtdXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHR1cm5PZmZBY3RpdmVCZ0NvbG9yKCk7XG4gICAgICAgICAgZGlzYWJsZUdlc3R1cmVzKCk7XG4gICAgICAgICAgXG4gICAgICAgICAgY3kuYXV0b3VuZ3JhYmlmeSh0cnVlKTtcblxuICAgICAgICAgIGNhbnZhcy5nZXRTdGFnZSgpLm9uKFwiY29udGVudFRvdWNoZW5kIGNvbnRlbnRNb3VzZXVwXCIsIGFuY2hvck1hbmFnZXIuZU1vdXNlVXApO1xuICAgICAgICAgIGNhbnZhcy5nZXRTdGFnZSgpLm9uKFwiY29udGVudE1vdXNlb3V0XCIsIGFuY2hvck1hbmFnZXIuZU1vdXNlT3V0KTtcbiAgICAgICAgfSxcbiAgICAgICAgLy8gZ2V0cyBjYWxsZWQgYmVmb3JlIGN5Lm9uKCd0YXBlbmQnKVxuICAgICAgICBlTW91c2VVcDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgIC8vIHdvbid0IGJlIGNhbGxlZCBpZiB0aGUgbW91c2UgaXMgcmVsZWFzZWQgb3V0IG9mIHNjcmVlblxuICAgICAgICAgIGFuY2hvclRvdWNoZWQgPSBmYWxzZTtcbiAgICAgICAgICBhbmNob3JNYW5hZ2VyLnRvdWNoZWRBbmNob3IgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgbW91c2VPdXQgPSBmYWxzZTtcbiAgICAgICAgICBhbmNob3JNYW5hZ2VyLmVkZ2Uuc2VsZWN0KCk7XG4gICAgICAgICAgXG4gICAgICAgICAgcmVzZXRBY3RpdmVCZ0NvbG9yKCk7XG4gICAgICAgICAgcmVzZXRHZXN0dXJlcygpO1xuICAgICAgICAgIFxuICAgICAgICAgIC8qIFxuICAgICAgICAgICAqIElNUE9SVEFOVFxuICAgICAgICAgICAqIEFueSBwcm9ncmFtbWF0aWMgY2FsbHMgdG8gLnNlbGVjdCgpLCAudW5zZWxlY3QoKSBhZnRlciB0aGlzIHN0YXRlbWVudCBhcmUgaWdub3JlZFxuICAgICAgICAgICAqIHVudGlsIGN5LmF1dG91bnNlbGVjdGlmeShmYWxzZSkgaXMgY2FsbGVkIGluIG9uZSBvZiB0aGUgcHJldmlvdXM6XG4gICAgICAgICAgICogXG4gICAgICAgICAgICogY3kub24oJ3RhcHN0YXJ0JylcbiAgICAgICAgICAgKiBhbmNob3Iub24oJ21vdXNlZG93biB0b3VjaHN0YXJ0JylcbiAgICAgICAgICAgKiBkb2N1bWVudC5vbigna2V5ZG93bicpXG4gICAgICAgICAgICogY3kub24oJ3RhcGRyYXAnKVxuICAgICAgICAgICAqIFxuICAgICAgICAgICAqIERvZXNuJ3QgYWZmZWN0IFVYLCBidXQgbWF5IGNhdXNlIGNvbmZ1c2luZyBiZWhhdmlvdXIgaWYgbm90IGF3YXJlIG9mIHRoaXMgd2hlbiBjb2RpbmdcbiAgICAgICAgICAgKiBcbiAgICAgICAgICAgKiBXaHkgaXMgdGhpcyBoZXJlP1xuICAgICAgICAgICAqIFRoaXMgaXMgaW1wb3J0YW50IHRvIGtlZXAgZWRnZXMgZnJvbSBiZWluZyBhdXRvIGRlc2VsZWN0ZWQgZnJvbSB3b3JraW5nXG4gICAgICAgICAgICogd2l0aCBhbmNob3JzIG91dCBvZiB0aGUgZWRnZSBib2R5IChmb3IgdW5idW5kbGVkIGJlemllciwgdGVjaG5pY2FsbHkgbm90IG5lY2Vzc2VyeSBmb3Igc2VnZW1lbnRzKS5cbiAgICAgICAgICAgKiBcbiAgICAgICAgICAgKiBUaGVzZSBpcyBhbnRoZXIgY3kuYXV0b3NlbGVjdGlmeSh0cnVlKSBpbiBjeS5vbigndGFwZW5kJykgXG4gICAgICAgICAgICogXG4gICAgICAgICAgKi8gXG4gICAgICAgICAgY3kuYXV0b3Vuc2VsZWN0aWZ5KHRydWUpO1xuICAgICAgICAgIGN5LmF1dG91bmdyYWJpZnkoZmFsc2UpO1xuXG4gICAgICAgICAgY2FudmFzLmdldFN0YWdlKCkub2ZmKFwiY29udGVudFRvdWNoZW5kIGNvbnRlbnRNb3VzZXVwXCIsIGFuY2hvck1hbmFnZXIuZU1vdXNlVXApO1xuICAgICAgICAgIGNhbnZhcy5nZXRTdGFnZSgpLm9mZihcImNvbnRlbnRNb3VzZW91dFwiLCBhbmNob3JNYW5hZ2VyLmVNb3VzZU91dCk7XG4gICAgICAgIH0sXG4gICAgICAgIC8vIGhhbmRsZSBtb3VzZSBnb2luZyBvdXQgb2YgY2FudmFzIFxuICAgICAgICBlTW91c2VPdXQ6IGZ1bmN0aW9uIChldmVudCl7XG4gICAgICAgICAgbW91c2VPdXQgPSB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICBjbGVhckFuY2hvcnNFeGNlcHQ6IGZ1bmN0aW9uKGRvbnRDbGVhbiA9IHVuZGVmaW5lZCl7XG4gICAgICAgICAgdmFyIGV4Y2VwdGlvbkFwcGxpZXMgPSBmYWxzZTtcblxuICAgICAgICAgIHRoaXMuYW5jaG9ycy5mb3JFYWNoKChhbmNob3IsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICBpZihkb250Q2xlYW4gJiYgYW5jaG9yID09PSBkb250Q2xlYW4pe1xuICAgICAgICAgICAgICBleGNlcHRpb25BcHBsaWVzID0gdHJ1ZTsgLy8gdGhlIGRvbnRDbGVhbiBhbmNob3IgaXMgbm90IGNsZWFyZWRcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnVuYmluZExpc3RlbmVycyhhbmNob3IpO1xuICAgICAgICAgICAgYW5jaG9yLmRlc3Ryb3koKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmKGV4Y2VwdGlvbkFwcGxpZXMpe1xuICAgICAgICAgICAgdGhpcy5hbmNob3JzID0gW2RvbnRDbGVhbl07XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hbmNob3JzID0gW107XG4gICAgICAgICAgICB0aGlzLmVkZ2UgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB0aGlzLmVkZ2VUeXBlID0gJ25vbmUnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgLy8gcmVuZGVyIHRoZSBiZW5kIGFuZCBjb250cm9sIHNoYXBlcyBvZiB0aGUgZ2l2ZW4gZWRnZVxuICAgICAgICByZW5kZXJBbmNob3JTaGFwZXM6IGZ1bmN0aW9uKGVkZ2UpIHtcbiAgICAgICAgICB0aGlzLmVkZ2UgPSBlZGdlO1xuICAgICAgICAgIHRoaXMuZWRnZVR5cGUgPSBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRFZGdlVHlwZShlZGdlKTtcblxuICAgICAgICAgIGlmKCFlZGdlLmhhc0NsYXNzKCdlZGdlYmVuZGVkaXRpbmctaGFzYmVuZHBvaW50cycpICYmXG4gICAgICAgICAgICAgICFlZGdlLmhhc0NsYXNzKCdlZGdlY29udHJvbGVkaXRpbmctaGFzY29udHJvbHBvaW50cycpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHZhciBhbmNob3JMaXN0ID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0QW5jaG9yc0FzQXJyYXkoZWRnZSk7Ly9lZGdlLl9wcml2YXRlLnJkYXRhLnNlZ3B0cztcbiAgICAgICAgICB2YXIgbGVuZ3RoID0gZ2V0QW5jaG9yU2hhcGVzTGVuZ3RoKGVkZ2UpICogMC42NTtcbiAgICAgICAgICBcbiAgICAgICAgICB2YXIgc3JjUG9zID0gZWRnZS5zb3VyY2UoKS5wb3NpdGlvbigpO1xuICAgICAgICAgIHZhciB0Z3RQb3MgPSBlZGdlLnRhcmdldCgpLnBvc2l0aW9uKCk7XG5cbiAgICAgICAgICBmb3IodmFyIGkgPSAwOyBhbmNob3JMaXN0ICYmIGkgPCBhbmNob3JMaXN0Lmxlbmd0aDsgaSA9IGkgKyAyKXtcbiAgICAgICAgICAgIHZhciBhbmNob3JYID0gYW5jaG9yTGlzdFtpXTtcbiAgICAgICAgICAgIHZhciBhbmNob3JZID0gYW5jaG9yTGlzdFtpICsgMV07XG5cbiAgICAgICAgICAgIHRoaXMucmVuZGVyQW5jaG9yU2hhcGUoYW5jaG9yWCwgYW5jaG9yWSwgbGVuZ3RoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjYW52YXMuZHJhdygpO1xuICAgICAgICB9LFxuICAgICAgICAvLyByZW5kZXIgYSBhbmNob3Igc2hhcGUgd2l0aCB0aGUgZ2l2ZW4gcGFyYW1ldGVyc1xuICAgICAgICByZW5kZXJBbmNob3JTaGFwZTogZnVuY3Rpb24oYW5jaG9yWCwgYW5jaG9yWSwgbGVuZ3RoKSB7XG4gICAgICAgICAgLy8gZ2V0IHRoZSB0b3AgbGVmdCBjb29yZGluYXRlc1xuICAgICAgICAgIHZhciB0b3BMZWZ0WCA9IGFuY2hvclggLSBsZW5ndGggLyAyO1xuICAgICAgICAgIHZhciB0b3BMZWZ0WSA9IGFuY2hvclkgLSBsZW5ndGggLyAyO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIGNvbnZlcnQgdG8gcmVuZGVyZWQgcGFyYW1ldGVyc1xuICAgICAgICAgIHZhciByZW5kZXJlZFRvcExlZnRQb3MgPSBjb252ZXJ0VG9SZW5kZXJlZFBvc2l0aW9uKHt4OiB0b3BMZWZ0WCwgeTogdG9wTGVmdFl9KTtcbiAgICAgICAgICBsZW5ndGggKj0gY3kuem9vbSgpO1xuICAgICAgICAgIFxuICAgICAgICAgIHZhciBuZXdBbmNob3IgPSBuZXcgS29udmEuUmVjdCh7XG4gICAgICAgICAgICB4OiByZW5kZXJlZFRvcExlZnRQb3MueCxcbiAgICAgICAgICAgIHk6IHJlbmRlcmVkVG9wTGVmdFBvcy55LFxuICAgICAgICAgICAgd2lkdGg6IGxlbmd0aCxcbiAgICAgICAgICAgIGhlaWdodDogbGVuZ3RoLFxuICAgICAgICAgICAgZmlsbDogJ2JsYWNrJyxcbiAgICAgICAgICAgIHN0cm9rZVdpZHRoOiAwLFxuICAgICAgICAgICAgZHJhZ2dhYmxlOiB0cnVlXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICB0aGlzLmFuY2hvcnMucHVzaChuZXdBbmNob3IpO1xuICAgICAgICAgIHRoaXMuYmluZExpc3RlbmVycyhuZXdBbmNob3IpO1xuICAgICAgICAgIGNhbnZhcy5hZGQobmV3QW5jaG9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgdmFyIGN4dEFkZEJlbmRGY24gPSBmdW5jdGlvbihldmVudCl7XG4gICAgICAgIGN4dEFkZEFuY2hvckZjbihldmVudCwgJ2JlbmQnKTtcbiAgICAgIH1cblxuICAgICAgdmFyIGN4dEFkZENvbnRyb2xGY24gPSBmdW5jdGlvbihldmVudCkge1xuICAgICAgICBjeHRBZGRBbmNob3JGY24oZXZlbnQsICdjb250cm9sJyk7XG4gICAgICB9XG5cbiAgICAgIHZhciBjeHRBZGRBbmNob3JGY24gPSBmdW5jdGlvbiAoZXZlbnQsIGFuY2hvclR5cGUpIHtcbiAgICAgICAgdmFyIGVkZ2UgPSBldmVudC50YXJnZXQgfHwgZXZlbnQuY3lUYXJnZXQ7XG4gICAgICAgIGlmKCFhbmNob3JQb2ludFV0aWxpdGllcy5pc0lnbm9yZWRFZGdlKGVkZ2UpKSB7XG5cbiAgICAgICAgICB2YXIgdHlwZSA9IGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEVkZ2VUeXBlKGVkZ2UpO1xuICAgICAgICAgIHZhciB3ZWlnaHRzLCBkaXN0YW5jZXMsIHdlaWdodFN0ciwgZGlzdGFuY2VTdHI7XG5cbiAgICAgICAgICBpZih0eXBlID09PSAnbm9uZScpe1xuICAgICAgICAgICAgd2VpZ2h0cyA9IFtdO1xuICAgICAgICAgICAgZGlzdGFuY2VzID0gW107XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICB3ZWlnaHRTdHIgPSBhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddO1xuICAgICAgICAgICAgZGlzdGFuY2VTdHIgPSBhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ2Rpc3RhbmNlJ107XG5cbiAgICAgICAgICAgIHdlaWdodHMgPSBlZGdlLmRhdGEod2VpZ2h0U3RyKSA/IFtdLmNvbmNhdChlZGdlLmRhdGEod2VpZ2h0U3RyKSkgOiBlZGdlLmRhdGEod2VpZ2h0U3RyKTtcbiAgICAgICAgICAgIGRpc3RhbmNlcyA9IGVkZ2UuZGF0YShkaXN0YW5jZVN0cikgPyBbXS5jb25jYXQoZWRnZS5kYXRhKGRpc3RhbmNlU3RyKSkgOiBlZGdlLmRhdGEoZGlzdGFuY2VTdHIpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciBwYXJhbSA9IHtcbiAgICAgICAgICAgIGVkZ2U6IGVkZ2UsXG4gICAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgICAgd2VpZ2h0czogd2VpZ2h0cyxcbiAgICAgICAgICAgIGRpc3RhbmNlczogZGlzdGFuY2VzXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIHRoZSB1bmRlZmluZWQgZ28gZm9yIGVkZ2UgYW5kIG5ld0FuY2hvclBvaW50IHBhcmFtZXRlcnNcbiAgICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5hZGRBbmNob3JQb2ludCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgYW5jaG9yVHlwZSk7XG5cbiAgICAgICAgICBpZiAob3B0aW9ucygpLnVuZG9hYmxlKSB7XG4gICAgICAgICAgICBjeS51bmRvUmVkbygpLmRvKCdjaGFuZ2VBbmNob3JQb2ludHMnLCBwYXJhbSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmVmcmVzaERyYXdzKCk7XG4gICAgICAgIGVkZ2Uuc2VsZWN0KCk7XG4gICAgICB9O1xuXG4gICAgICB2YXIgY3h0UmVtb3ZlQW5jaG9yRmNuID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgIHZhciBlZGdlID0gYW5jaG9yTWFuYWdlci5lZGdlO1xuICAgICAgICB2YXIgdHlwZSA9IGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEVkZ2VUeXBlKGVkZ2UpO1xuXG4gICAgICAgIGlmKGFuY2hvclBvaW50VXRpbGl0aWVzLmVkZ2VUeXBlTm9uZVNob3VsZG50SGFwcGVuKHR5cGUsIFwiVWlVdGlsaXRpZXMuanMsIGN4dFJlbW92ZUFuY2hvckZjblwiKSl7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBhcmFtID0ge1xuICAgICAgICAgIGVkZ2U6IGVkZ2UsXG4gICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICB3ZWlnaHRzOiBbXS5jb25jYXQoZWRnZS5kYXRhKGFuY2hvclBvaW50VXRpbGl0aWVzLnN5bnRheFt0eXBlXVsnd2VpZ2h0J10pKSxcbiAgICAgICAgICBkaXN0YW5jZXM6IFtdLmNvbmNhdChlZGdlLmRhdGEoYW5jaG9yUG9pbnRVdGlsaXRpZXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZSddKSlcbiAgICAgICAgfTtcblxuICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5yZW1vdmVBbmNob3IoKTtcbiAgICAgICAgXG4gICAgICAgIGlmKG9wdGlvbnMoKS51bmRvYWJsZSkge1xuICAgICAgICAgIGN5LnVuZG9SZWRvKCkuZG8oJ2NoYW5nZUFuY2hvclBvaW50cycsIHBhcmFtKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe3JlZnJlc2hEcmF3cygpO2VkZ2Uuc2VsZWN0KCk7fSwgNTApIDtcblxuICAgICAgfTtcblxuICAgICAgdmFyIGN4dFJlbW92ZUFsbEFuY2hvcnNGY24gPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgdmFyIGVkZ2UgPSBhbmNob3JNYW5hZ2VyLmVkZ2U7XG4gICAgICAgIHZhciB0eXBlID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0RWRnZVR5cGUoZWRnZSk7XG4gICAgICAgIHZhciBwYXJhbSA9IHtcbiAgICAgICAgICBlZGdlOiBlZGdlLFxuICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgd2VpZ2h0czogW10uY29uY2F0KGVkZ2UuZGF0YShhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddKSksXG4gICAgICAgICAgZGlzdGFuY2VzOiBbXS5jb25jYXQoZWRnZS5kYXRhKGFuY2hvclBvaW50VXRpbGl0aWVzLnN5bnRheFt0eXBlXVsnZGlzdGFuY2UnXSkpXG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5yZW1vdmVBbGxBbmNob3JzKCk7XG5cbiAgICAgICAgaWYgKG9wdGlvbnMoKS51bmRvYWJsZSkge1xuICAgICAgICAgIGN5LnVuZG9SZWRvKCkuZG8oJ2NoYW5nZUFuY2hvclBvaW50cycsIHBhcmFtKTtcbiAgICAgICAgfVxuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7cmVmcmVzaERyYXdzKCk7ZWRnZS5zZWxlY3QoKTt9LCA1MCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIGZ1bmN0aW9uIHRvIHJlY29ubmVjdCBlZGdlXG4gICAgICB2YXIgaGFuZGxlUmVjb25uZWN0RWRnZSA9IG9wdHMuaGFuZGxlUmVjb25uZWN0RWRnZTtcbiAgICAgIC8vIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGVkZ2Ugc291cmNlIGFuZCB0YXJnZXQgb24gcmVjb25uZWN0aW9uXG4gICAgICB2YXIgdmFsaWRhdGVFZGdlID0gb3B0cy52YWxpZGF0ZUVkZ2U7IFxuICAgICAgLy8gZnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGludmFsaWQgZWRnZSByZWNvbm5lY3Rpb25cbiAgICAgIHZhciBhY3RPblVuc3VjY2Vzc2Z1bFJlY29ubmVjdGlvbiA9IG9wdHMuYWN0T25VbnN1Y2Nlc3NmdWxSZWNvbm5lY3Rpb247XG4gICAgICBcbiAgICAgIHZhciBtZW51SXRlbXMgPSBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogYWRkQmVuZFBvaW50Q3h0TWVudUlkLFxuICAgICAgICAgIGNvbnRlbnQ6IG9wdHMuYWRkQmVuZE1lbnVJdGVtVGl0bGUsXG4gICAgICAgICAgc2VsZWN0b3I6ICdlZGdlJyxcbiAgICAgICAgICBvbkNsaWNrRnVuY3Rpb246IGN4dEFkZEJlbmRGY24sXG4gICAgICAgICAgaGFzVHJhaWxpbmdEaXZpZGVyOiBvcHRzLnVzZVRyYWlsaW5nRGl2aWRlcnNBZnRlckNvbnRleHRNZW51T3B0aW9ucyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiByZW1vdmVCZW5kUG9pbnRDeHRNZW51SWQsXG4gICAgICAgICAgY29udGVudDogb3B0cy5yZW1vdmVCZW5kTWVudUl0ZW1UaXRsZSxcbiAgICAgICAgICBzZWxlY3RvcjogJ2VkZ2UnLFxuICAgICAgICAgIG9uQ2xpY2tGdW5jdGlvbjogY3h0UmVtb3ZlQW5jaG9yRmNuLFxuICAgICAgICAgIGhhc1RyYWlsaW5nRGl2aWRlcjogb3B0cy51c2VUcmFpbGluZ0RpdmlkZXJzQWZ0ZXJDb250ZXh0TWVudU9wdGlvbnMsXG4gICAgICAgIH0sIFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IHJlbW92ZUFsbEJlbmRQb2ludEN0eE1lbnVJZCxcbiAgICAgICAgICBjb250ZW50OiBvcHRzLnJlbW92ZUFsbEJlbmRNZW51SXRlbVRpdGxlLFxuICAgICAgICAgIHNlbGVjdG9yOiBvcHRzLmVuYWJsZU11bHRpcGxlQW5jaG9yUmVtb3ZhbE9wdGlvbiAmJiAnOnNlbGVjdGVkLmVkZ2ViZW5kZWRpdGluZy1oYXNtdWx0aXBsZWJlbmRwb2ludHMnLFxuICAgICAgICAgIG9uQ2xpY2tGdW5jdGlvbjogY3h0UmVtb3ZlQWxsQW5jaG9yc0ZjbixcbiAgICAgICAgICBoYXNUcmFpbGluZ0RpdmlkZXI6IG9wdHMudXNlVHJhaWxpbmdEaXZpZGVyc0FmdGVyQ29udGV4dE1lbnVPcHRpb25zLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgaWQ6IGFkZENvbnRyb2xQb2ludEN4dE1lbnVJZCxcbiAgICAgICAgICBjb250ZW50OiBvcHRzLmFkZENvbnRyb2xNZW51SXRlbVRpdGxlLFxuICAgICAgICAgIHNlbGVjdG9yOiAnZWRnZScsXG4gICAgICAgICAgY29yZUFzV2VsbDogdHJ1ZSxcbiAgICAgICAgICBvbkNsaWNrRnVuY3Rpb246IGN4dEFkZENvbnRyb2xGY24sXG4gICAgICAgICAgaGFzVHJhaWxpbmdEaXZpZGVyOiBvcHRzLnVzZVRyYWlsaW5nRGl2aWRlcnNBZnRlckNvbnRleHRNZW51T3B0aW9ucyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiByZW1vdmVDb250cm9sUG9pbnRDeHRNZW51SWQsXG4gICAgICAgICAgY29udGVudDogb3B0cy5yZW1vdmVDb250cm9sTWVudUl0ZW1UaXRsZSxcbiAgICAgICAgICBzZWxlY3RvcjogJ2VkZ2UnLFxuICAgICAgICAgIGNvcmVBc1dlbGw6IHRydWUsXG4gICAgICAgICAgb25DbGlja0Z1bmN0aW9uOiBjeHRSZW1vdmVBbmNob3JGY24sXG4gICAgICAgICAgaGFzVHJhaWxpbmdEaXZpZGVyOiBvcHRzLnVzZVRyYWlsaW5nRGl2aWRlcnNBZnRlckNvbnRleHRNZW51T3B0aW9ucyxcbiAgICAgICAgfSwgXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogcmVtb3ZlQWxsQ29udHJvbFBvaW50Q3R4TWVudUlkLFxuICAgICAgICAgIGNvbnRlbnQ6IG9wdHMucmVtb3ZlQWxsQ29udHJvbE1lbnVJdGVtVGl0bGUsXG4gICAgICAgICAgc2VsZWN0b3I6IG9wdHMuZW5hYmxlTXVsdGlwbGVBbmNob3JSZW1vdmFsT3B0aW9uICYmICc6c2VsZWN0ZWQuZWRnZWNvbnRyb2xlZGl0aW5nLWhhc211bHRpcGxlY29udHJvbHBvaW50cycsXG4gICAgICAgICAgb25DbGlja0Z1bmN0aW9uOiBjeHRSZW1vdmVBbGxBbmNob3JzRmNuLFxuICAgICAgICAgIGhhc1RyYWlsaW5nRGl2aWRlcjogb3B0cy51c2VUcmFpbGluZ0RpdmlkZXJzQWZ0ZXJDb250ZXh0TWVudU9wdGlvbnMsXG4gICAgICAgIH0sXG4gICAgICBdO1xuICAgICAgXG4gICAgICBpZihjeS5jb250ZXh0TWVudXMpIHtcbiAgICAgICAgdmFyIG1lbnVzID0gY3kuY29udGV4dE1lbnVzKCdnZXQnKTtcbiAgICAgICAgLy8gSWYgY29udGV4dCBtZW51cyBpcyBhY3RpdmUganVzdCBhcHBlbmQgbWVudSBpdGVtcyBlbHNlIGFjdGl2YXRlIHRoZSBleHRlbnNpb25cbiAgICAgICAgLy8gd2l0aCBpbml0aWFsIG1lbnUgaXRlbXNcbiAgICAgICAgaWYgKG1lbnVzLmlzQWN0aXZlKCkpIHtcbiAgICAgICAgICBtZW51cy5hcHBlbmRNZW51SXRlbXMobWVudUl0ZW1zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBjeS5jb250ZXh0TWVudXMoe1xuICAgICAgICAgICAgbWVudUl0ZW1zOiBtZW51SXRlbXNcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICB2YXIgX3NpemVDYW52YXMgPSBkZWJvdW5jZShmdW5jdGlvbiAoKSB7XG4gICAgICAgICRjYW52YXNFbGVtZW50XG4gICAgICAgICAgLmF0dHIoJ2hlaWdodCcsICRjb250YWluZXIuaGVpZ2h0KCkpXG4gICAgICAgICAgLmF0dHIoJ3dpZHRoJywgJGNvbnRhaW5lci53aWR0aCgpKVxuICAgICAgICAgIC5jc3Moe1xuICAgICAgICAgICAgJ3Bvc2l0aW9uJzogJ2Fic29sdXRlJyxcbiAgICAgICAgICAgICd0b3AnOiAwLFxuICAgICAgICAgICAgJ2xlZnQnOiAwLFxuICAgICAgICAgICAgJ3otaW5kZXgnOiBvcHRpb25zKCkuekluZGV4XG4gICAgICAgICAgfSlcbiAgICAgICAgO1xuXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBjYW52YXNCYiA9ICRjYW52YXNFbGVtZW50Lm9mZnNldCgpO1xuICAgICAgICAgIHZhciBjb250YWluZXJCYiA9ICRjb250YWluZXIub2Zmc2V0KCk7XG5cbiAgICAgICAgICAkY2FudmFzRWxlbWVudFxuICAgICAgICAgICAgLmNzcyh7XG4gICAgICAgICAgICAgICd0b3AnOiAtKGNhbnZhc0JiLnRvcCAtIGNvbnRhaW5lckJiLnRvcCksXG4gICAgICAgICAgICAgICdsZWZ0JzogLShjYW52YXNCYi5sZWZ0IC0gY29udGFpbmVyQmIubGVmdClcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgO1xuXG4gICAgICAgICAgY2FudmFzLmdldFN0YWdlKCkuc2V0V2lkdGgoJGNvbnRhaW5lci53aWR0aCgpKTtcbiAgICAgICAgICBjYW52YXMuZ2V0U3RhZ2UoKS5zZXRIZWlnaHQoJGNvbnRhaW5lci5oZWlnaHQoKSk7XG5cbiAgICAgICAgICAvLyByZWRyYXcgb24gY2FudmFzIHJlc2l6ZVxuICAgICAgICAgIGlmKGN5KXtcbiAgICAgICAgICAgIHJlZnJlc2hEcmF3cygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgMCk7XG5cbiAgICAgIH0sIDI1MCk7XG5cbiAgICAgIGZ1bmN0aW9uIHNpemVDYW52YXMoKSB7XG4gICAgICAgIF9zaXplQ2FudmFzKCk7XG4gICAgICB9XG5cbiAgICAgIHNpemVDYW52YXMoKTtcblxuICAgICAgJCh3aW5kb3cpLmJpbmQoJ3Jlc2l6ZScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2l6ZUNhbnZhcygpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIHdyaXRlIG9wdGlvbnMgdG8gZGF0YVxuICAgICAgdmFyIGRhdGEgPSAkY29udGFpbmVyLmRhdGEoJ2N5ZWRnZWVkaXRpbmcnKTtcbiAgICAgIGlmIChkYXRhID09IG51bGwpIHtcbiAgICAgICAgZGF0YSA9IHt9O1xuICAgICAgfVxuICAgICAgZGF0YS5vcHRpb25zID0gb3B0cztcblxuICAgICAgdmFyIG9wdENhY2hlO1xuXG4gICAgICBmdW5jdGlvbiBvcHRpb25zKCkge1xuICAgICAgICByZXR1cm4gb3B0Q2FjaGUgfHwgKG9wdENhY2hlID0gJGNvbnRhaW5lci5kYXRhKCdjeWVkZ2VlZGl0aW5nJykub3B0aW9ucyk7XG4gICAgICB9XG5cbiAgICAgIC8vIHdlIHdpbGwgbmVlZCB0byBjb252ZXJ0IG1vZGVsIHBvc2l0b25zIHRvIHJlbmRlcmVkIHBvc2l0aW9uc1xuICAgICAgZnVuY3Rpb24gY29udmVydFRvUmVuZGVyZWRQb3NpdGlvbihtb2RlbFBvc2l0aW9uKSB7XG4gICAgICAgIHZhciBwYW4gPSBjeS5wYW4oKTtcbiAgICAgICAgdmFyIHpvb20gPSBjeS56b29tKCk7XG5cbiAgICAgICAgdmFyIHggPSBtb2RlbFBvc2l0aW9uLnggKiB6b29tICsgcGFuLng7XG4gICAgICAgIHZhciB5ID0gbW9kZWxQb3NpdGlvbi55ICogem9vbSArIHBhbi55O1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgeDogeCxcbiAgICAgICAgICB5OiB5XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBcbiAgICAgIGZ1bmN0aW9uIHJlZnJlc2hEcmF3cygpIHtcblxuICAgICAgICAvLyBkb24ndCBjbGVhciBhbmNob3Igd2hpY2ggaXMgYmVpbmcgbW92ZWRcbiAgICAgICAgYW5jaG9yTWFuYWdlci5jbGVhckFuY2hvcnNFeGNlcHQoYW5jaG9yTWFuYWdlci50b3VjaGVkQW5jaG9yKTtcbiAgICAgICAgXG4gICAgICAgIGlmKGVuZHBvaW50U2hhcGUxICE9PSBudWxsKXtcbiAgICAgICAgICBlbmRwb2ludFNoYXBlMS5kZXN0cm95KCk7XG4gICAgICAgICAgZW5kcG9pbnRTaGFwZTEgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmKGVuZHBvaW50U2hhcGUyICE9PSBudWxsKXtcbiAgICAgICAgICBlbmRwb2ludFNoYXBlMi5kZXN0cm95KCk7XG4gICAgICAgICAgZW5kcG9pbnRTaGFwZTIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNhbnZhcy5kcmF3KCk7XG5cbiAgICAgICAgaWYoIGVkZ2VUb0hpZ2hsaWdodCApIHtcbiAgICAgICAgICBhbmNob3JNYW5hZ2VyLnJlbmRlckFuY2hvclNoYXBlcyhlZGdlVG9IaWdobGlnaHQpO1xuICAgICAgICAgIHJlbmRlckVuZFBvaW50U2hhcGVzKGVkZ2VUb0hpZ2hsaWdodCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gcmVuZGVyIHRoZSBlbmQgcG9pbnRzIHNoYXBlcyBvZiB0aGUgZ2l2ZW4gZWRnZVxuICAgICAgZnVuY3Rpb24gcmVuZGVyRW5kUG9pbnRTaGFwZXMoZWRnZSkge1xuICAgICAgICBpZighZWRnZSl7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVkZ2VfcHRzID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0QW5jaG9yc0FzQXJyYXkoZWRnZSk7XG4gICAgICAgIGlmKHR5cGVvZiBlZGdlX3B0cyA9PT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICAgIGVkZ2VfcHRzID0gW107XG4gICAgICAgIH0gICAgICAgXG4gICAgICAgIHZhciBzb3VyY2VQb3MgPSBlZGdlLnNvdXJjZUVuZHBvaW50KCk7XG4gICAgICAgIHZhciB0YXJnZXRQb3MgPSBlZGdlLnRhcmdldEVuZHBvaW50KCk7XG5cbiAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBpcyBjYWxsZWQgaW5zaWRlIHJlZnJlc2hEcmF3cyB3aGljaCBpcyBjYWxsZWRcbiAgICAgICAgLy8gZm9yIHVwZGF0aW5nIEtvbnZhIHNoYXBlcyBvbiBldmVudHMsIGJ1dCBzb21ldGltZXMgdGhlc2UgdmFsdWVzXG4gICAgICAgIC8vIHdpbGwgYmUgTmFOIGFuZCBLb252YSB3aWxsIHNob3cgd2FybmluZ3MgaW4gY29uc29sZSBhcyBhIHJlc3VsdFxuICAgICAgICAvLyBUaGlzIGlzIGEgY2hlY2sgdG8gZWxpbWluYXRlIHRob3NlIGNhc2VzIHNpbmNlIGlmIHRoZXNlIHZhbHVlcyBcbiAgICAgICAgLy8gYXJlIE5hTiBub3RoaW5nIHdpbGwgYmUgZHJhd24gYW55d2F5LlxuICAgICAgICBpZiAoIXNvdXJjZVBvcy54IHx8ICF0YXJnZXRQb3MueCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGVkZ2VfcHRzLnVuc2hpZnQoc291cmNlUG9zLnkpO1xuICAgICAgICBlZGdlX3B0cy51bnNoaWZ0KHNvdXJjZVBvcy54KTtcbiAgICAgICAgZWRnZV9wdHMucHVzaCh0YXJnZXRQb3MueCk7XG4gICAgICAgIGVkZ2VfcHRzLnB1c2godGFyZ2V0UG9zLnkpOyBcblxuICAgICAgIFxuICAgICAgICBpZighZWRnZV9wdHMpXG4gICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBzcmMgPSB7XG4gICAgICAgICAgeDogZWRnZV9wdHNbMF0sXG4gICAgICAgICAgeTogZWRnZV9wdHNbMV1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0YXJnZXQgPSB7XG4gICAgICAgICAgeDogZWRnZV9wdHNbZWRnZV9wdHMubGVuZ3RoLTJdLFxuICAgICAgICAgIHk6IGVkZ2VfcHRzW2VkZ2VfcHRzLmxlbmd0aC0xXVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG5leHRUb1NvdXJjZSA9IHtcbiAgICAgICAgICB4OiBlZGdlX3B0c1syXSxcbiAgICAgICAgICB5OiBlZGdlX3B0c1szXVxuICAgICAgICB9XG4gICAgICAgIHZhciBuZXh0VG9UYXJnZXQgPSB7XG4gICAgICAgICAgeDogZWRnZV9wdHNbZWRnZV9wdHMubGVuZ3RoLTRdLFxuICAgICAgICAgIHk6IGVkZ2VfcHRzW2VkZ2VfcHRzLmxlbmd0aC0zXVxuICAgICAgICB9XG4gICAgICAgIHZhciBsZW5ndGggPSBnZXRBbmNob3JTaGFwZXNMZW5ndGgoZWRnZSkgKiAwLjY1O1xuICAgICAgICBcbiAgICAgICAgcmVuZGVyRWFjaEVuZFBvaW50U2hhcGUoc3JjLCB0YXJnZXQsIGxlbmd0aCxuZXh0VG9Tb3VyY2UsbmV4dFRvVGFyZ2V0KTtcbiAgICAgICAgXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIHJlbmRlckVhY2hFbmRQb2ludFNoYXBlKHNvdXJjZSwgdGFyZ2V0LCBsZW5ndGgsbmV4dFRvU291cmNlLG5leHRUb1RhcmdldCkge1xuICAgICAgICAvLyBnZXQgdGhlIHRvcCBsZWZ0IGNvb3JkaW5hdGVzIG9mIHNvdXJjZSBhbmQgdGFyZ2V0XG4gICAgICAgIHZhciBzVG9wTGVmdFggPSBzb3VyY2UueCAtIGxlbmd0aCAvIDI7XG4gICAgICAgIHZhciBzVG9wTGVmdFkgPSBzb3VyY2UueSAtIGxlbmd0aCAvIDI7XG5cbiAgICAgICAgdmFyIHRUb3BMZWZ0WCA9IHRhcmdldC54IC0gbGVuZ3RoIC8gMjtcbiAgICAgICAgdmFyIHRUb3BMZWZ0WSA9IHRhcmdldC55IC0gbGVuZ3RoIC8gMjtcblxuICAgICAgICB2YXIgbmV4dFRvU291cmNlWCA9IG5leHRUb1NvdXJjZS54IC0gbGVuZ3RoIC8yO1xuICAgICAgICB2YXIgbmV4dFRvU291cmNlWSA9IG5leHRUb1NvdXJjZS55IC0gbGVuZ3RoIC8gMjtcblxuICAgICAgICB2YXIgbmV4dFRvVGFyZ2V0WCA9IG5leHRUb1RhcmdldC54IC0gbGVuZ3RoIC8yO1xuICAgICAgICB2YXIgbmV4dFRvVGFyZ2V0WSA9IG5leHRUb1RhcmdldC55IC0gbGVuZ3RoIC8yO1xuXG5cbiAgICAgICAgLy8gY29udmVydCB0byByZW5kZXJlZCBwYXJhbWV0ZXJzXG4gICAgICAgIHZhciByZW5kZXJlZFNvdXJjZVBvcyA9IGNvbnZlcnRUb1JlbmRlcmVkUG9zaXRpb24oe3g6IHNUb3BMZWZ0WCwgeTogc1RvcExlZnRZfSk7XG4gICAgICAgIHZhciByZW5kZXJlZFRhcmdldFBvcyA9IGNvbnZlcnRUb1JlbmRlcmVkUG9zaXRpb24oe3g6IHRUb3BMZWZ0WCwgeTogdFRvcExlZnRZfSk7XG4gICAgICAgIGxlbmd0aCA9IGxlbmd0aCAqIGN5Lnpvb20oKSAvIDI7XG5cbiAgICAgICAgdmFyIHJlbmRlcmVkTmV4dFRvU291cmNlID0gY29udmVydFRvUmVuZGVyZWRQb3NpdGlvbih7eDogbmV4dFRvU291cmNlWCwgeTogbmV4dFRvU291cmNlWX0pO1xuICAgICAgICB2YXIgcmVuZGVyZWROZXh0VG9UYXJnZXQgPSBjb252ZXJ0VG9SZW5kZXJlZFBvc2l0aW9uKHt4OiBuZXh0VG9UYXJnZXRYLCB5OiBuZXh0VG9UYXJnZXRZfSk7XG4gICAgICAgIFxuICAgICAgICAvL2hvdyBmYXIgdG8gZ28gZnJvbSB0aGUgbm9kZSBhbG9uZyB0aGUgZWRnZVxuICAgICAgICB2YXIgZGlzdGFuY2VGcm9tTm9kZSA9IGxlbmd0aDtcblxuICAgICAgICB2YXIgZGlzdGFuY2VTb3VyY2UgPSBNYXRoLnNxcnQoTWF0aC5wb3cocmVuZGVyZWROZXh0VG9Tb3VyY2UueCAtIHJlbmRlcmVkU291cmNlUG9zLngsMikgKyBNYXRoLnBvdyhyZW5kZXJlZE5leHRUb1NvdXJjZS55IC0gcmVuZGVyZWRTb3VyY2VQb3MueSwyKSk7ICAgICAgICBcbiAgICAgICAgdmFyIHNvdXJjZUVuZFBvaW50WCA9IHJlbmRlcmVkU291cmNlUG9zLnggKyAoKGRpc3RhbmNlRnJvbU5vZGUvIGRpc3RhbmNlU291cmNlKSogKHJlbmRlcmVkTmV4dFRvU291cmNlLnggLSByZW5kZXJlZFNvdXJjZVBvcy54KSk7XG4gICAgICAgIHZhciBzb3VyY2VFbmRQb2ludFkgPSByZW5kZXJlZFNvdXJjZVBvcy55ICsgKChkaXN0YW5jZUZyb21Ob2RlLyBkaXN0YW5jZVNvdXJjZSkqIChyZW5kZXJlZE5leHRUb1NvdXJjZS55IC0gcmVuZGVyZWRTb3VyY2VQb3MueSkpO1xuXG5cbiAgICAgICAgdmFyIGRpc3RhbmNlVGFyZ2V0ID0gTWF0aC5zcXJ0KE1hdGgucG93KHJlbmRlcmVkTmV4dFRvVGFyZ2V0LnggLSByZW5kZXJlZFRhcmdldFBvcy54LDIpICsgTWF0aC5wb3cocmVuZGVyZWROZXh0VG9UYXJnZXQueSAtIHJlbmRlcmVkVGFyZ2V0UG9zLnksMikpOyAgICAgICAgXG4gICAgICAgIHZhciB0YXJnZXRFbmRQb2ludFggPSByZW5kZXJlZFRhcmdldFBvcy54ICsgKChkaXN0YW5jZUZyb21Ob2RlLyBkaXN0YW5jZVRhcmdldCkqIChyZW5kZXJlZE5leHRUb1RhcmdldC54IC0gcmVuZGVyZWRUYXJnZXRQb3MueCkpO1xuICAgICAgICB2YXIgdGFyZ2V0RW5kUG9pbnRZID0gcmVuZGVyZWRUYXJnZXRQb3MueSArICgoZGlzdGFuY2VGcm9tTm9kZS8gZGlzdGFuY2VUYXJnZXQpKiAocmVuZGVyZWROZXh0VG9UYXJnZXQueSAtIHJlbmRlcmVkVGFyZ2V0UG9zLnkpKTsgXG5cbiAgICAgICAgLy8gcmVuZGVyIGVuZCBwb2ludCBzaGFwZSBmb3Igc291cmNlIGFuZCB0YXJnZXRcbiAgICAgICAgLy8gdGhlIG51bGwgY2hlY2tzIGFyZSBub3QgdGhlb3JldGljYWxseSByZXF1aXJlZFxuICAgICAgICAvLyBidXQgdGhleSBwcm90ZWN0IGZyb20gYmFkIHN5bmNocm9uaW91cyBjYWxscyBvZiByZWZyZXNoRHJhd3MoKVxuICAgICAgICBpZihlbmRwb2ludFNoYXBlMSA9PT0gbnVsbCl7XG4gICAgICAgICAgZW5kcG9pbnRTaGFwZTEgPSBuZXcgS29udmEuQ2lyY2xlKHtcbiAgICAgICAgICAgIHg6IHNvdXJjZUVuZFBvaW50WCArIGxlbmd0aCxcbiAgICAgICAgICAgIHk6IHNvdXJjZUVuZFBvaW50WSArIGxlbmd0aCxcbiAgICAgICAgICAgIHJhZGl1czogbGVuZ3RoLFxuICAgICAgICAgICAgZmlsbDogJ2JsYWNrJyxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGVuZHBvaW50U2hhcGUyID09PSBudWxsKXtcbiAgICAgICAgICBlbmRwb2ludFNoYXBlMiA9IG5ldyBLb252YS5DaXJjbGUoe1xuICAgICAgICAgICAgeDogdGFyZ2V0RW5kUG9pbnRYICsgbGVuZ3RoLFxuICAgICAgICAgICAgeTogdGFyZ2V0RW5kUG9pbnRZICsgbGVuZ3RoLFxuICAgICAgICAgICAgcmFkaXVzOiBsZW5ndGgsXG4gICAgICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY2FudmFzLmFkZChlbmRwb2ludFNoYXBlMSk7XG4gICAgICAgIGNhbnZhcy5hZGQoZW5kcG9pbnRTaGFwZTIpO1xuICAgICAgICBjYW52YXMuZHJhdygpO1xuICAgICAgICBcbiAgICAgIH1cblxuICAgICAgLy8gZ2V0IHRoZSBsZW5ndGggb2YgYW5jaG9yIHBvaW50cyB0byBiZSByZW5kZXJlZFxuICAgICAgZnVuY3Rpb24gZ2V0QW5jaG9yU2hhcGVzTGVuZ3RoKGVkZ2UpIHtcbiAgICAgICAgdmFyIGZhY3RvciA9IG9wdGlvbnMoKS5hbmNob3JTaGFwZVNpemVGYWN0b3I7XG4gICAgICAgIGlmIChwYXJzZUZsb2F0KGVkZ2UuY3NzKCd3aWR0aCcpKSA8PSAyLjUpXG4gICAgICAgICAgcmV0dXJuIDIuNSAqIGZhY3RvcjtcbiAgICAgICAgZWxzZSByZXR1cm4gcGFyc2VGbG9hdChlZGdlLmNzcygnd2lkdGgnKSkqZmFjdG9yO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBjaGVjayBpZiB0aGUgYW5jaG9yIHJlcHJlc2VudGVkIGJ5IHt4LCB5fSBpcyBpbnNpZGUgdGhlIHBvaW50IHNoYXBlXG4gICAgICBmdW5jdGlvbiBjaGVja0lmSW5zaWRlU2hhcGUoeCwgeSwgbGVuZ3RoLCBjZW50ZXJYLCBjZW50ZXJZKXtcbiAgICAgICAgdmFyIG1pblggPSBjZW50ZXJYIC0gbGVuZ3RoIC8gMjtcbiAgICAgICAgdmFyIG1heFggPSBjZW50ZXJYICsgbGVuZ3RoIC8gMjtcbiAgICAgICAgdmFyIG1pblkgPSBjZW50ZXJZIC0gbGVuZ3RoIC8gMjtcbiAgICAgICAgdmFyIG1heFkgPSBjZW50ZXJZICsgbGVuZ3RoIC8gMjtcbiAgICAgICAgXG4gICAgICAgIHZhciBpbnNpZGUgPSAoeCA+PSBtaW5YICYmIHggPD0gbWF4WCkgJiYgKHkgPj0gbWluWSAmJiB5IDw9IG1heFkpO1xuICAgICAgICByZXR1cm4gaW5zaWRlO1xuICAgICAgfVxuXG4gICAgICAvLyBnZXQgdGhlIGluZGV4IG9mIGFuY2hvciBjb250YWluaW5nIHRoZSBwb2ludCByZXByZXNlbnRlZCBieSB7eCwgeX1cbiAgICAgIGZ1bmN0aW9uIGdldENvbnRhaW5pbmdTaGFwZUluZGV4KHgsIHksIGVkZ2UpIHtcbiAgICAgICAgdmFyIHR5cGUgPSBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRFZGdlVHlwZShlZGdlKTtcblxuICAgICAgICBpZih0eXBlID09PSAnbm9uZScpe1xuICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGVkZ2UuZGF0YShhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddKSA9PSBudWxsIHx8IFxuICAgICAgICAgIGVkZ2UuZGF0YShhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddKS5sZW5ndGggPT0gMCl7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGFuY2hvckxpc3QgPSBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRBbmNob3JzQXNBcnJheShlZGdlKTsvL2VkZ2UuX3ByaXZhdGUucmRhdGEuc2VncHRzO1xuICAgICAgICB2YXIgbGVuZ3RoID0gZ2V0QW5jaG9yU2hhcGVzTGVuZ3RoKGVkZ2UpO1xuXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGFuY2hvckxpc3QgJiYgaSA8IGFuY2hvckxpc3QubGVuZ3RoOyBpID0gaSArIDIpe1xuICAgICAgICAgIHZhciBhbmNob3JYID0gYW5jaG9yTGlzdFtpXTtcbiAgICAgICAgICB2YXIgYW5jaG9yWSA9IGFuY2hvckxpc3RbaSArIDFdO1xuXG4gICAgICAgICAgdmFyIGluc2lkZSA9IGNoZWNrSWZJbnNpZGVTaGFwZSh4LCB5LCBsZW5ndGgsIGFuY2hvclgsIGFuY2hvclkpO1xuICAgICAgICAgIGlmKGluc2lkZSl7XG4gICAgICAgICAgICByZXR1cm4gaSAvIDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfTtcblxuICAgICAgZnVuY3Rpb24gZ2V0Q29udGFpbmluZ0VuZFBvaW50KHgsIHksIGVkZ2Upe1xuICAgICAgICB2YXIgbGVuZ3RoID0gZ2V0QW5jaG9yU2hhcGVzTGVuZ3RoKGVkZ2UpO1xuICAgICAgICB2YXIgYWxsUHRzID0gZWRnZS5fcHJpdmF0ZS5yc2NyYXRjaC5hbGxwdHM7XG4gICAgICAgIHZhciBzcmMgPSB7XG4gICAgICAgICAgeDogYWxsUHRzWzBdLFxuICAgICAgICAgIHk6IGFsbFB0c1sxXVxuICAgICAgICB9XG4gICAgICAgIHZhciB0YXJnZXQgPSB7XG4gICAgICAgICAgeDogYWxsUHRzW2FsbFB0cy5sZW5ndGgtMl0sXG4gICAgICAgICAgeTogYWxsUHRzW2FsbFB0cy5sZW5ndGgtMV1cbiAgICAgICAgfVxuICAgICAgICBjb252ZXJ0VG9SZW5kZXJlZFBvc2l0aW9uKHNyYyk7XG4gICAgICAgIGNvbnZlcnRUb1JlbmRlcmVkUG9zaXRpb24odGFyZ2V0KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFNvdXJjZTowLCBUYXJnZXQ6MSwgTm9uZTotMVxuICAgICAgICBpZihjaGVja0lmSW5zaWRlU2hhcGUoeCwgeSwgbGVuZ3RoLCBzcmMueCwgc3JjLnkpKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICBlbHNlIGlmKGNoZWNrSWZJbnNpZGVTaGFwZSh4LCB5LCBsZW5ndGgsIHRhcmdldC54LCB0YXJnZXQueSkpXG4gICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIHN0b3JlIHRoZSBjdXJyZW50IHN0YXR1cyBvZiBnZXN0dXJlcyBhbmQgc2V0IHRoZW0gdG8gZmFsc2VcbiAgICAgIGZ1bmN0aW9uIGRpc2FibGVHZXN0dXJlcygpIHtcbiAgICAgICAgbGFzdFBhbm5pbmdFbmFibGVkID0gY3kucGFubmluZ0VuYWJsZWQoKTtcbiAgICAgICAgbGFzdFpvb21pbmdFbmFibGVkID0gY3kuem9vbWluZ0VuYWJsZWQoKTtcbiAgICAgICAgbGFzdEJveFNlbGVjdGlvbkVuYWJsZWQgPSBjeS5ib3hTZWxlY3Rpb25FbmFibGVkKCk7XG5cbiAgICAgICAgY3kuem9vbWluZ0VuYWJsZWQoZmFsc2UpXG4gICAgICAgICAgLnBhbm5pbmdFbmFibGVkKGZhbHNlKVxuICAgICAgICAgIC5ib3hTZWxlY3Rpb25FbmFibGVkKGZhbHNlKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gcmVzZXQgdGhlIGdlc3R1cmVzIGJ5IHRoZWlyIGxhdGVzdCBzdGF0dXNcbiAgICAgIGZ1bmN0aW9uIHJlc2V0R2VzdHVyZXMoKSB7XG4gICAgICAgIGN5Lnpvb21pbmdFbmFibGVkKGxhc3Rab29taW5nRW5hYmxlZClcbiAgICAgICAgICAucGFubmluZ0VuYWJsZWQobGFzdFBhbm5pbmdFbmFibGVkKVxuICAgICAgICAgIC5ib3hTZWxlY3Rpb25FbmFibGVkKGxhc3RCb3hTZWxlY3Rpb25FbmFibGVkKTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gdHVybk9mZkFjdGl2ZUJnQ29sb3IoKXtcbiAgICAgICAgLy8gZm91bmQgdGhpcyBhdCB0aGUgY3ktbm9kZS1yZXNpemUgY29kZSwgYnV0IGRvZXNuJ3Qgc2VlbSB0byBmaW5kIHRoZSBvYmplY3QgbW9zdCBvZiB0aGUgdGltZVxuICAgICAgICBpZiggY3kuc3R5bGUoKS5fcHJpdmF0ZS5jb3JlU3R5bGVbXCJhY3RpdmUtYmctb3BhY2l0eVwiXSkge1xuICAgICAgICAgIGxhc3RBY3RpdmVCZ09wYWNpdHkgPSBjeS5zdHlsZSgpLl9wcml2YXRlLmNvcmVTdHlsZVtcImFjdGl2ZS1iZy1vcGFjaXR5XCJdLnZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIC8vIGFyYml0cmFyeSwgZmVlbCBmcmVlIHRvIGNoYW5nZVxuICAgICAgICAgIC8vIHRyaWFsIGFuZCBlcnJvciBzaG93ZWQgdGhhdCAwLjE1IHdhcyBjbG9zZXN0IHRvIHRoZSBvbGQgY29sb3JcbiAgICAgICAgICBsYXN0QWN0aXZlQmdPcGFjaXR5ID0gMC4xNTtcbiAgICAgICAgfVxuXG4gICAgICAgIGN5LnN0eWxlKClcbiAgICAgICAgICAuc2VsZWN0b3IoXCJjb3JlXCIpXG4gICAgICAgICAgLnN0eWxlKFwiYWN0aXZlLWJnLW9wYWNpdHlcIiwgMClcbiAgICAgICAgICAudXBkYXRlKCk7XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIHJlc2V0QWN0aXZlQmdDb2xvcigpe1xuICAgICAgICBjeS5zdHlsZSgpXG4gICAgICAgICAgLnNlbGVjdG9yKFwiY29yZVwiKVxuICAgICAgICAgIC5zdHlsZShcImFjdGl2ZS1iZy1vcGFjaXR5XCIsIGxhc3RBY3RpdmVCZ09wYWNpdHkpXG4gICAgICAgICAgLnVwZGF0ZSgpO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBtb3ZlQW5jaG9yUG9pbnRzKHBvc2l0aW9uRGlmZiwgZWRnZXMpIHtcbiAgICAgICAgICBlZGdlcy5mb3JFYWNoKGZ1bmN0aW9uKCBlZGdlICl7XG4gICAgICAgICAgICAgIHZhciBwcmV2aW91c0FuY2hvcnNQb3NpdGlvbiA9IGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEFuY2hvcnNBc0FycmF5KGVkZ2UpO1xuICAgICAgICAgICAgICB2YXIgbmV4dEFuY2hvclBvaW50c1Bvc2l0aW9uID0gW107XG4gICAgICAgICAgICAgIGlmIChwcmV2aW91c0FuY2hvcnNQb3NpdGlvbiAhPSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8cHJldmlvdXNBbmNob3JzUG9zaXRpb24ubGVuZ3RoOyBpKz0yKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbmV4dEFuY2hvclBvaW50c1Bvc2l0aW9uLnB1c2goe3g6IHByZXZpb3VzQW5jaG9yc1Bvc2l0aW9uW2ldK3Bvc2l0aW9uRGlmZi54LCB5OiBwcmV2aW91c0FuY2hvcnNQb3NpdGlvbltpKzFdK3Bvc2l0aW9uRGlmZi55fSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciB0eXBlID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0RWRnZVR5cGUoZWRnZSk7XG5cbiAgICAgICAgICAgICAgICBpZihhbmNob3JQb2ludFV0aWxpdGllcy5lZGdlVHlwZU5vbmVTaG91bGRudEhhcHBlbih0eXBlLCBcIlVpVXRpbGl0aWVzLmpzLCBtb3ZlQW5jaG9yUG9pbnRzXCIpKXtcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodHlwZSA9PT0gJ2JlbmQnKSB7XG4gICAgICAgICAgICAgICAgICBwYXJhbXMuYmVuZFBvaW50UG9zaXRpb25zU2V0dGVyRnVuY3Rpb24oZWRnZSwgbmV4dEFuY2hvclBvaW50c1Bvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAodHlwZSA9PT0gJ2NvbnRyb2wnKSB7XG4gICAgICAgICAgICAgICAgICBwYXJhbXMuY29udHJvbFBvaW50UG9zaXRpb25zU2V0dGVyRnVuY3Rpb24oZWRnZSwgbmV4dEFuY2hvclBvaW50c1Bvc2l0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5pbml0QW5jaG9yUG9pbnRzKG9wdGlvbnMoKS5iZW5kUG9zaXRpb25zRnVuY3Rpb24sIG9wdGlvbnMoKS5jb250cm9sUG9zaXRpb25zRnVuY3Rpb24sIGVkZ2VzKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBMaXN0ZW5lciBkZWZpbmVkIGluIG90aGVyIGV4dGVuc2lvblxuICAgICAgICAgIC8vIE1pZ2h0IGhhdmUgY29tcGF0aWJpbGl0eSBpc3N1ZXMgYWZ0ZXIgdGhlIHVuYnVuZGxlZCBiZXppZXJcbiAgICAgICAgICBjeS50cmlnZ2VyKCdiZW5kUG9pbnRNb3ZlbWVudCcpOyBcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gbW92ZUFuY2hvck9uRHJhZyhlZGdlLCB0eXBlLCBpbmRleCwgcG9zaXRpb24pe1xuICAgICAgICB2YXIgd2VpZ2h0cyA9IGVkZ2UuZGF0YShhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddKTtcbiAgICAgICAgdmFyIGRpc3RhbmNlcyA9IGVkZ2UuZGF0YShhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ2Rpc3RhbmNlJ10pO1xuICAgICAgICBcbiAgICAgICAgdmFyIHJlbGF0aXZlQW5jaG9yUG9zaXRpb24gPSBhbmNob3JQb2ludFV0aWxpdGllcy5jb252ZXJ0VG9SZWxhdGl2ZVBvc2l0aW9uKGVkZ2UsIHBvc2l0aW9uKTtcbiAgICAgICAgd2VpZ2h0c1tpbmRleF0gPSByZWxhdGl2ZUFuY2hvclBvc2l0aW9uLndlaWdodDtcbiAgICAgICAgZGlzdGFuY2VzW2luZGV4XSA9IHJlbGF0aXZlQW5jaG9yUG9zaXRpb24uZGlzdGFuY2U7XG4gICAgICAgIFxuICAgICAgICBlZGdlLmRhdGEoYW5jaG9yUG9pbnRVdGlsaXRpZXMuc3ludGF4W3R5cGVdWyd3ZWlnaHQnXSwgd2VpZ2h0cyk7XG4gICAgICAgIGVkZ2UuZGF0YShhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ2Rpc3RhbmNlJ10sIGRpc3RhbmNlcyk7XG4gICAgICB9XG5cbiAgICAgIC8vIGRlYm91bmNlZCBkdWUgdG8gbGFyZ2UgYW1vdXQgb2YgY2FsbHMgdG8gdGFwZHJhZ1xuICAgICAgdmFyIF9tb3ZlQW5jaG9yT25EcmFnID0gZGVib3VuY2UoIG1vdmVBbmNob3JPbkRyYWcsIDUpO1xuXG4gICAgICB7ICBcbiAgICAgICAgbGFzdFBhbm5pbmdFbmFibGVkID0gY3kucGFubmluZ0VuYWJsZWQoKTtcbiAgICAgICAgbGFzdFpvb21pbmdFbmFibGVkID0gY3kuem9vbWluZ0VuYWJsZWQoKTtcbiAgICAgICAgbGFzdEJveFNlbGVjdGlvbkVuYWJsZWQgPSBjeS5ib3hTZWxlY3Rpb25FbmFibGVkKCk7XG4gICAgICAgIFxuICAgICAgICAvLyBJbml0aWxpemUgdGhlIGVkZ2VUb0hpZ2hsaWdodEJlbmRzIGFuZCBudW1iZXJPZlNlbGVjdGVkRWRnZXNcbiAgICAgICAge1xuICAgICAgICAgIHZhciBzZWxlY3RlZEVkZ2VzID0gY3kuZWRnZXMoJzpzZWxlY3RlZCcpO1xuICAgICAgICAgIHZhciBudW1iZXJPZlNlbGVjdGVkRWRnZXMgPSBzZWxlY3RlZEVkZ2VzLmxlbmd0aDtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9PT0gMSApIHtcbiAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodCA9IHNlbGVjdGVkRWRnZXNbMF07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjeS5iaW5kKCd6b29tIHBhbicsIGVab29tID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGlmICggIWVkZ2VUb0hpZ2hsaWdodCApIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGN5Lm9uKCdkYXRhJywgJ2VkZ2UnLCBlRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBpZiAoICFlZGdlVG9IaWdobGlnaHQgKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHJlZnJlc2hEcmF3cygpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjeS5vbignc3R5bGUnLCAnZWRnZS5lZGdlYmVuZGVkaXRpbmctaGFzYmVuZHBvaW50czpzZWxlY3RlZCwgZWRnZS5lZGdlY29udHJvbGVkaXRpbmctaGFzY29udHJvbHBvaW50czpzZWxlY3RlZCcsIGVTdHlsZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7cmVmcmVzaERyYXdzKCl9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGN5Lm9uKCdyZW1vdmUnLCAnZWRnZScsIGVSZW1vdmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgdmFyIGVkZ2UgPSB0aGlzO1xuICAgICAgICAgIGlmIChlZGdlLnNlbGVjdGVkKCkpIHtcbiAgICAgICAgICAgIG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9IG51bWJlck9mU2VsZWN0ZWRFZGdlcyAtIDE7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGN5LnN0YXJ0QmF0Y2goKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGVkZ2VUb0hpZ2hsaWdodCkge1xuICAgICAgICAgICAgICBlZGdlVG9IaWdobGlnaHQucmVtb3ZlQ2xhc3MoJ2N5LWVkZ2UtZWRpdGluZy1oaWdobGlnaHQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9PT0gMSkge1xuICAgICAgICAgICAgICB2YXIgc2VsZWN0ZWRFZGdlcyA9IGN5LmVkZ2VzKCc6c2VsZWN0ZWQnKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIElmIHVzZXIgcmVtb3ZlcyBhbGwgc2VsZWN0ZWQgZWRnZXMgYXQgYSBzaW5nbGUgb3BlcmF0aW9uIHRoZW4gb3VyICdudW1iZXJPZlNlbGVjdGVkRWRnZXMnXG4gICAgICAgICAgICAgIC8vIG1heSBiZSBtaXNsZWFkaW5nLiBUaGVyZWZvcmUgd2UgbmVlZCB0byBjaGVjayBpZiB0aGUgbnVtYmVyIG9mIGVkZ2VzIHRvIGhpZ2hsaWdodCBpcyByZWFseSAxIGhlcmUuXG4gICAgICAgICAgICAgIGlmIChzZWxlY3RlZEVkZ2VzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodCA9IHNlbGVjdGVkRWRnZXNbMF07XG4gICAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0LmFkZENsYXNzKCdjeS1lZGdlLWVkaXRpbmctaGlnaGxpZ2h0Jyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjeS5lbmRCYXRjaCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICAgY3kub24oJ2FkZCcsICdlZGdlJywgZUFkZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgZWRnZSA9IHRoaXM7XG4gICAgICAgICAgaWYgKGVkZ2Uuc2VsZWN0ZWQoKSkge1xuICAgICAgICAgICAgbnVtYmVyT2ZTZWxlY3RlZEVkZ2VzID0gbnVtYmVyT2ZTZWxlY3RlZEVkZ2VzICsgMTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY3kuc3RhcnRCYXRjaCgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoZWRnZVRvSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodC5yZW1vdmVDbGFzcygnY3ktZWRnZS1lZGl0aW5nLWhpZ2hsaWdodCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAobnVtYmVyT2ZTZWxlY3RlZEVkZ2VzID09PSAxKSB7XG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodCA9IGVkZ2U7XG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodC5hZGRDbGFzcygnY3ktZWRnZS1lZGl0aW5nLWhpZ2hsaWdodCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY3kuZW5kQmF0Y2goKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVmcmVzaERyYXdzKCk7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgY3kub24oJ3NlbGVjdCcsICdlZGdlJywgZVNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgZWRnZSA9IHRoaXM7XG5cbiAgICAgICAgICBpZihlZGdlLnRhcmdldCgpLmNvbm5lY3RlZEVkZ2VzKCkubGVuZ3RoID09IDAgfHwgZWRnZS5zb3VyY2UoKS5jb25uZWN0ZWRFZGdlcygpLmxlbmd0aCA9PSAwKXtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgIFxuICAgICAgICAgIG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9IG51bWJlck9mU2VsZWN0ZWRFZGdlcyArIDE7XG4gICAgICAgICAgXG4gICAgICAgICAgY3kuc3RhcnRCYXRjaCgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgaWYgKGVkZ2VUb0hpZ2hsaWdodCkge1xuICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0LnJlbW92ZUNsYXNzKCdjeS1lZGdlLWVkaXRpbmctaGlnaGxpZ2h0Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgaWYgKG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9PT0gMSkge1xuICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0ID0gZWRnZTtcbiAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodC5hZGRDbGFzcygnY3ktZWRnZS1lZGl0aW5nLWhpZ2hsaWdodCcpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgY3kuZW5kQmF0Y2goKTtcbiAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBjeS5vbigndW5zZWxlY3QnLCAnZWRnZScsIGVVbnNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBudW1iZXJPZlNlbGVjdGVkRWRnZXMgPSBudW1iZXJPZlNlbGVjdGVkRWRnZXMgLSAxO1xuICAgICAgICAgICAgXG4gICAgICAgICAgY3kuc3RhcnRCYXRjaCgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgaWYgKGVkZ2VUb0hpZ2hsaWdodCkge1xuICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0LnJlbW92ZUNsYXNzKCdjeS1lZGdlLWVkaXRpbmctaGlnaGxpZ2h0Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgaWYgKG51bWJlck9mU2VsZWN0ZWRFZGdlcyA9PT0gMSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGVkRWRnZXMgPSBjeS5lZGdlcygnOnNlbGVjdGVkJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIElmIHVzZXIgdW5zZWxlY3RzIGFsbCBlZGdlcyBieSB0YXBwaW5nIHRvIHRoZSBjb3JlIGV0Yy4gdGhlbiBvdXIgJ251bWJlck9mU2VsZWN0ZWRFZGdlcydcbiAgICAgICAgICAgIC8vIG1heSBiZSBtaXNsZWFkaW5nLiBUaGVyZWZvcmUgd2UgbmVlZCB0byBjaGVjayBpZiB0aGUgbnVtYmVyIG9mIGVkZ2VzIHRvIGhpZ2hsaWdodCBpcyByZWFseSAxIGhlcmUuXG4gICAgICAgICAgICBpZiAoc2VsZWN0ZWRFZGdlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0ID0gc2VsZWN0ZWRFZGdlc1swXTtcbiAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0LmFkZENsYXNzKCdjeS1lZGdlLWVkaXRpbmctaGlnaGxpZ2h0Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgZWRnZVRvSGlnaGxpZ2h0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgY3kuZW5kQmF0Y2goKTtcbiAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICB2YXIgbW92ZWRBbmNob3JJbmRleDtcbiAgICAgICAgdmFyIHRhcFN0YXJ0UG9zO1xuICAgICAgICB2YXIgbW92ZWRFZGdlO1xuICAgICAgICB2YXIgbW92ZUFuY2hvclBhcmFtO1xuICAgICAgICB2YXIgY3JlYXRlQW5jaG9yT25EcmFnO1xuICAgICAgICB2YXIgbW92ZWRFbmRQb2ludDtcbiAgICAgICAgdmFyIGR1bW15Tm9kZTtcbiAgICAgICAgdmFyIGRldGFjaGVkTm9kZTtcbiAgICAgICAgdmFyIG5vZGVUb0F0dGFjaDtcbiAgICAgICAgdmFyIGFuY2hvckNyZWF0ZWRCeURyYWcgPSBmYWxzZTtcblxuICAgICAgICBjeS5vbigndGFwc3RhcnQnLCBlVGFwU3RhcnQgPSBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgIHRhcFN0YXJ0UG9zID0gZXZlbnQucG9zaXRpb24gfHwgZXZlbnQuY3lQb3NpdGlvbjtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY3kub24oJ3RhcHN0YXJ0JywgJ2VkZ2UnLCBlVGFwU3RhcnRPbkVkZ2UgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICB2YXIgZWRnZSA9IHRoaXM7XG5cbiAgICAgICAgICBpZiAoIWVkZ2VUb0hpZ2hsaWdodCB8fCBlZGdlVG9IaWdobGlnaHQuaWQoKSAhPT0gZWRnZS5pZCgpKSB7XG4gICAgICAgICAgICBjcmVhdGVBbmNob3JPbkRyYWcgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgbW92ZWRFZGdlID0gZWRnZTtcblxuICAgICAgICAgIHZhciB0eXBlID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0RWRnZVR5cGUoZWRnZSk7XG5cbiAgICAgICAgICAvLyB0byBhdm9pZCBlcnJvcnNcbiAgICAgICAgICBpZih0eXBlID09PSAnbm9uZScpXG4gICAgICAgICAgICB0eXBlID0gJ2JlbmQnO1xuICAgICAgICAgIFxuICAgICAgICAgIHZhciBjeVBvc1ggPSB0YXBTdGFydFBvcy54O1xuICAgICAgICAgIHZhciBjeVBvc1kgPSB0YXBTdGFydFBvcy55O1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIEdldCB3aGljaCBlbmQgcG9pbnQgaGFzIGJlZW4gY2xpY2tlZCAoU291cmNlOjAsIFRhcmdldDoxLCBOb25lOi0xKVxuICAgICAgICAgIHZhciBlbmRQb2ludCA9IGdldENvbnRhaW5pbmdFbmRQb2ludChjeVBvc1gsIGN5UG9zWSwgZWRnZSk7XG5cbiAgICAgICAgICBpZihlbmRQb2ludCA9PSAwIHx8IGVuZFBvaW50ID09IDEpe1xuICAgICAgICAgICAgZWRnZS51bnNlbGVjdCgpO1xuICAgICAgICAgICAgbW92ZWRFbmRQb2ludCA9IGVuZFBvaW50O1xuICAgICAgICAgICAgZGV0YWNoZWROb2RlID0gKGVuZFBvaW50ID09IDApID8gbW92ZWRFZGdlLnNvdXJjZSgpIDogbW92ZWRFZGdlLnRhcmdldCgpO1xuXG4gICAgICAgICAgICB2YXIgZGlzY29ubmVjdGVkRW5kID0gKGVuZFBvaW50ID09IDApID8gJ3NvdXJjZScgOiAndGFyZ2V0JztcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSByZWNvbm5lY3Rpb25VdGlsaXRpZXMuZGlzY29ubmVjdEVkZ2UobW92ZWRFZGdlLCBjeSwgZXZlbnQucmVuZGVyZWRQb3NpdGlvbiwgZGlzY29ubmVjdGVkRW5kKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZHVtbXlOb2RlID0gcmVzdWx0LmR1bW15Tm9kZTtcbiAgICAgICAgICAgIG1vdmVkRWRnZSA9IHJlc3VsdC5lZGdlO1xuXG4gICAgICAgICAgICBkaXNhYmxlR2VzdHVyZXMoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBtb3ZlZEFuY2hvckluZGV4ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgY3JlYXRlQW5jaG9yT25EcmFnID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgY3kub24oJ2RyYWcnLCAnbm9kZScsIGVEcmFnID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGlmIChlZGdlVG9IaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHJlZnJlc2hEcmF3cygpO1xuICAgICAgICAgIH0gXG4gICAgICAgIH0pO1xuICAgICAgICBjeS5vbigndGFwZHJhZycsIGVUYXBEcmFnID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgLyoqIFxuICAgICAgICAgICAqIGlmIHRoZXJlIGlzIGEgc2VsZWN0ZWQgZWRnZSBzZXQgYXV0b3Vuc2VsZWN0aWZ5IGZhbHNlXG4gICAgICAgICAgICogZml4ZXMgdGhlIG5vZGUtZWRpdGluZyBwcm9ibGVtIHdoZXJlIG5vZGVzIHdvdWxkIGdldFxuICAgICAgICAgICAqIHVuc2VsZWN0ZWQgYWZ0ZXIgcmVzaXplIGRyYWdcbiAgICAgICAgICAqL1xuICAgICAgICAgIGlmIChjeS5lZGdlcygnOnNlbGVjdGVkJykubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY3kuYXV0b3Vuc2VsZWN0aWZ5KGZhbHNlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIGVkZ2UgPSBtb3ZlZEVkZ2U7XG5cbiAgICAgICAgICBpZihtb3ZlZEVkZ2UgIT09IHVuZGVmaW5lZCAmJiBhbmNob3JQb2ludFV0aWxpdGllcy5pc0lnbm9yZWRFZGdlKGVkZ2UpICkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciB0eXBlID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0RWRnZVR5cGUoZWRnZSk7XG5cbiAgICAgICAgICBpZihjcmVhdGVBbmNob3JPbkRyYWcgJiYgb3B0cy5lbmFibGVDcmVhdGVBbmNob3JPbkRyYWcgJiYgIWFuY2hvclRvdWNoZWQgJiYgdHlwZSAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAvLyByZW1lbWJlciBzdGF0ZSBiZWZvcmUgY3JlYXRpbmcgYW5jaG9yXG4gICAgICAgICAgICB2YXIgd2VpZ2h0U3RyID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuc3ludGF4W3R5cGVdWyd3ZWlnaHQnXTtcbiAgICAgICAgICAgIHZhciBkaXN0YW5jZVN0ciA9IGFuY2hvclBvaW50VXRpbGl0aWVzLnN5bnRheFt0eXBlXVsnZGlzdGFuY2UnXTtcblxuICAgICAgICAgICAgbW92ZUFuY2hvclBhcmFtID0ge1xuICAgICAgICAgICAgICBlZGdlOiBlZGdlLFxuICAgICAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgICAgICB3ZWlnaHRzOiBlZGdlLmRhdGEod2VpZ2h0U3RyKSA/IFtdLmNvbmNhdChlZGdlLmRhdGEod2VpZ2h0U3RyKSkgOiBbXSxcbiAgICAgICAgICAgICAgZGlzdGFuY2VzOiBlZGdlLmRhdGEoZGlzdGFuY2VTdHIpID8gW10uY29uY2F0KGVkZ2UuZGF0YShkaXN0YW5jZVN0cikpIDogW11cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGVkZ2UudW5zZWxlY3QoKTtcblxuICAgICAgICAgICAgLy8gdXNpbmcgdGFwc3RhcnQgcG9zaXRpb24gZml4ZXMgYnVnIG9uIHF1aWNrIGRyYWdzXG4gICAgICAgICAgICAvLyAtLS0gXG4gICAgICAgICAgICAvLyBhbHNvIG1vZGlmaWVkIGFkZEFuY2hvclBvaW50IHRvIHJldHVybiB0aGUgaW5kZXggYmVjYXVzZVxuICAgICAgICAgICAgLy8gZ2V0Q29udGFpbmluZ1NoYXBlSW5kZXggZmFpbGVkIHRvIGZpbmQgdGhlIGNyZWF0ZWQgYW5jaG9yIG9uIHF1aWNrIGRyYWdzXG4gICAgICAgICAgICBtb3ZlZEFuY2hvckluZGV4ID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuYWRkQW5jaG9yUG9pbnQoZWRnZSwgdGFwU3RhcnRQb3MpO1xuICAgICAgICAgICAgbW92ZWRFZGdlID0gZWRnZTtcbiAgICAgICAgICAgIGNyZWF0ZUFuY2hvck9uRHJhZyA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGFuY2hvckNyZWF0ZWRCeURyYWcgPSB0cnVlO1xuICAgICAgICAgICAgZGlzYWJsZUdlc3R1cmVzKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gaWYgdGhlIHRhcHN0YXJ0IGRpZCBub3QgaGl0IGFuIGVkZ2UgYW5kIGl0IGRpZCBub3QgaGl0IGFuIGFuY2hvclxuICAgICAgICAgIGlmICghYW5jaG9yVG91Y2hlZCAmJiAobW92ZWRFZGdlID09PSB1bmRlZmluZWQgfHwgXG4gICAgICAgICAgICAobW92ZWRBbmNob3JJbmRleCA9PT0gdW5kZWZpbmVkICYmIG1vdmVkRW5kUG9pbnQgPT09IHVuZGVmaW5lZCkpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIGV2ZW50UG9zID0gZXZlbnQucG9zaXRpb24gfHwgZXZlbnQuY3lQb3NpdGlvbjtcblxuICAgICAgICAgIC8vIFVwZGF0ZSBlbmQgcG9pbnQgbG9jYXRpb24gKFNvdXJjZTowLCBUYXJnZXQ6MSlcbiAgICAgICAgICBpZihtb3ZlZEVuZFBvaW50ICE9IC0xICYmIGR1bW15Tm9kZSl7XG4gICAgICAgICAgICBkdW1teU5vZGUucG9zaXRpb24oZXZlbnRQb3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBjaGFuZ2UgbG9jYXRpb24gb2YgYW5jaG9yIGNyZWF0ZWQgYnkgZHJhZ1xuICAgICAgICAgIGVsc2UgaWYobW92ZWRBbmNob3JJbmRleCAhPSB1bmRlZmluZWQpe1xuICAgICAgICAgICAgX21vdmVBbmNob3JPbkRyYWcoZWRnZSwgdHlwZSwgbW92ZWRBbmNob3JJbmRleCwgZXZlbnRQb3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBjaGFuZ2UgbG9jYXRpb24gb2YgZHJhZyBhbmQgZHJvcHBlZCBhbmNob3JcbiAgICAgICAgICBlbHNlIGlmKGFuY2hvclRvdWNoZWQpe1xuXG4gICAgICAgICAgICAvLyB0aGUgdGFwU3RhcnRQb3MgY2hlY2sgaXMgbmVjZXNzYXJ5IHdoZW4gcmlnaCBjbGlja2luZyBhbmNob3IgcG9pbnRzXG4gICAgICAgICAgICAvLyByaWdodCBjbGlja2luZyBhbmNob3IgcG9pbnRzIHRyaWdnZXJzIE1vdXNlRG93biBmb3IgS29udmEsIGJ1dCBub3QgdGFwc3RhcnQgZm9yIGN5XG4gICAgICAgICAgICAvLyB3aGVuIHRoYXQgaGFwcGVucyB0YXBTdGFydFBvcyBpcyB1bmRlZmluZWRcbiAgICAgICAgICAgIGlmKGFuY2hvck1hbmFnZXIudG91Y2hlZEFuY2hvckluZGV4ID09PSB1bmRlZmluZWQgJiYgdGFwU3RhcnRQb3Mpe1xuICAgICAgICAgICAgICBhbmNob3JNYW5hZ2VyLnRvdWNoZWRBbmNob3JJbmRleCA9IGdldENvbnRhaW5pbmdTaGFwZUluZGV4KFxuICAgICAgICAgICAgICAgIHRhcFN0YXJ0UG9zLngsIFxuICAgICAgICAgICAgICAgIHRhcFN0YXJ0UG9zLnksXG4gICAgICAgICAgICAgICAgYW5jaG9yTWFuYWdlci5lZGdlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoYW5jaG9yTWFuYWdlci50b3VjaGVkQW5jaG9ySW5kZXggIT09IHVuZGVmaW5lZCl7XG4gICAgICAgICAgICAgIF9tb3ZlQW5jaG9yT25EcmFnKFxuICAgICAgICAgICAgICAgIGFuY2hvck1hbmFnZXIuZWRnZSxcbiAgICAgICAgICAgICAgICBhbmNob3JNYW5hZ2VyLmVkZ2VUeXBlLFxuICAgICAgICAgICAgICAgIGFuY2hvck1hbmFnZXIudG91Y2hlZEFuY2hvckluZGV4LFxuICAgICAgICAgICAgICAgIGV2ZW50UG9zXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGlmKGV2ZW50LnRhcmdldCAmJiBldmVudC50YXJnZXRbMF0gJiYgZXZlbnQudGFyZ2V0LmlzTm9kZSgpKXtcbiAgICAgICAgICAgIG5vZGVUb0F0dGFjaCA9IGV2ZW50LnRhcmdldDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBjeS5vbigndGFwZW5kJywgZVRhcEVuZCA9IGZ1bmN0aW9uIChldmVudCkge1xuXG4gICAgICAgICAgaWYobW91c2VPdXQpe1xuICAgICAgICAgICAgY2FudmFzLmdldFN0YWdlKCkuZmlyZShcImNvbnRlbnRNb3VzZXVwXCIpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciBlZGdlID0gbW92ZWRFZGdlIHx8IGFuY2hvck1hbmFnZXIuZWRnZTsgXG4gICAgICAgICAgXG4gICAgICAgICAgaWYoIGVkZ2UgIT09IHVuZGVmaW5lZCApIHtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IGFuY2hvck1hbmFnZXIudG91Y2hlZEFuY2hvckluZGV4O1xuICAgICAgICAgICAgaWYoIGluZGV4ICE9IHVuZGVmaW5lZCApIHtcbiAgICAgICAgICAgICAgdmFyIHN0YXJ0WCA9IGVkZ2Uuc291cmNlKCkucG9zaXRpb24oJ3gnKTtcbiAgICAgICAgICAgICAgdmFyIHN0YXJ0WSA9IGVkZ2Uuc291cmNlKCkucG9zaXRpb24oJ3knKTtcbiAgICAgICAgICAgICAgdmFyIGVuZFggPSBlZGdlLnRhcmdldCgpLnBvc2l0aW9uKCd4Jyk7XG4gICAgICAgICAgICAgIHZhciBlbmRZID0gZWRnZS50YXJnZXQoKS5wb3NpdGlvbigneScpO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIGFuY2hvckxpc3QgPSBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRBbmNob3JzQXNBcnJheShlZGdlKTtcbiAgICAgICAgICAgICAgdmFyIGFsbEFuY2hvcnMgPSBbc3RhcnRYLCBzdGFydFldLmNvbmNhdChhbmNob3JMaXN0KS5jb25jYXQoW2VuZFgsIGVuZFldKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBhbmNob3JJbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgICAgICAgdmFyIHByZUluZGV4ID0gYW5jaG9ySW5kZXggLSAxO1xuICAgICAgICAgICAgICB2YXIgcG9zSW5kZXggPSBhbmNob3JJbmRleCArIDE7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgYW5jaG9yID0ge1xuICAgICAgICAgICAgICAgIHg6IGFsbEFuY2hvcnNbMiAqIGFuY2hvckluZGV4XSxcbiAgICAgICAgICAgICAgICB5OiBhbGxBbmNob3JzWzIgKiBhbmNob3JJbmRleCArIDFdXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB2YXIgcHJlQW5jaG9yUG9pbnQgPSB7XG4gICAgICAgICAgICAgICAgeDogYWxsQW5jaG9yc1syICogcHJlSW5kZXhdLFxuICAgICAgICAgICAgICAgIHk6IGFsbEFuY2hvcnNbMiAqIHByZUluZGV4ICsgMV1cbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHZhciBwb3NBbmNob3JQb2ludCA9IHtcbiAgICAgICAgICAgICAgICB4OiBhbGxBbmNob3JzWzIgKiBwb3NJbmRleF0sXG4gICAgICAgICAgICAgICAgeTogYWxsQW5jaG9yc1syICogcG9zSW5kZXggKyAxXVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIG5lYXJUb0xpbmU7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiggKCBhbmNob3IueCA9PT0gcHJlQW5jaG9yUG9pbnQueCAmJiBhbmNob3IueSA9PT0gcHJlQW5jaG9yUG9pbnQueSApIHx8ICggYW5jaG9yLnggPT09IHByZUFuY2hvclBvaW50LnggJiYgYW5jaG9yLnkgPT09IHByZUFuY2hvclBvaW50LnkgKSApIHtcbiAgICAgICAgICAgICAgICBuZWFyVG9MaW5lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgbTEgPSAoIHByZUFuY2hvclBvaW50LnkgLSBwb3NBbmNob3JQb2ludC55ICkgLyAoIHByZUFuY2hvclBvaW50LnggLSBwb3NBbmNob3JQb2ludC54ICk7XG4gICAgICAgICAgICAgICAgdmFyIG0yID0gLTEgLyBtMTtcblxuICAgICAgICAgICAgICAgIHZhciBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cyA9IHtcbiAgICAgICAgICAgICAgICAgIHNyY1BvaW50OiBwcmVBbmNob3JQb2ludCxcbiAgICAgICAgICAgICAgICAgIHRndFBvaW50OiBwb3NBbmNob3JQb2ludCxcbiAgICAgICAgICAgICAgICAgIG0xOiBtMSxcbiAgICAgICAgICAgICAgICAgIG0yOiBtMlxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudEludGVyc2VjdGlvbiA9IGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEludGVyc2VjdGlvbihlZGdlLCBhbmNob3IsIHNyY1RndFBvaW50c0FuZFRhbmdlbnRzKTtcbiAgICAgICAgICAgICAgICB2YXIgZGlzdCA9IE1hdGguc3FydCggTWF0aC5wb3coIChhbmNob3IueCAtIGN1cnJlbnRJbnRlcnNlY3Rpb24ueCksIDIgKSBcbiAgICAgICAgICAgICAgICAgICAgICAgICsgTWF0aC5wb3coIChhbmNob3IueSAtIGN1cnJlbnRJbnRlcnNlY3Rpb24ueSksIDIgKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSBiZW5kIHBvaW50IGlmIHNlZ21lbnQgZWRnZSBiZWNvbWVzIHN0cmFpZ2h0XG4gICAgICAgICAgICAgICAgdmFyIHR5cGUgPSBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRFZGdlVHlwZShlZGdlKTtcbiAgICAgICAgICAgICAgICBpZiggKHR5cGUgPT09ICdiZW5kJyAmJiBkaXN0ICA8IG9wdGlvbnMoKS5iZW5kUmVtb3ZhbFNlbnNpdGl2aXR5KSkge1xuICAgICAgICAgICAgICAgICAgbmVhclRvTGluZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiggbmVhclRvTGluZSApXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5yZW1vdmVBbmNob3IoZWRnZSwgaW5kZXgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZihkdW1teU5vZGUgIT0gdW5kZWZpbmVkICYmIChtb3ZlZEVuZFBvaW50ID09IDAgfHwgbW92ZWRFbmRQb2ludCA9PSAxKSApe1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdmFyIG5ld05vZGUgPSBkZXRhY2hlZE5vZGU7XG4gICAgICAgICAgICAgIHZhciBpc1ZhbGlkID0gJ3ZhbGlkJztcbiAgICAgICAgICAgICAgdmFyIGxvY2F0aW9uID0gKG1vdmVkRW5kUG9pbnQgPT0gMCkgPyAnc291cmNlJyA6ICd0YXJnZXQnO1xuXG4gICAgICAgICAgICAgIC8vIHZhbGlkYXRlIGVkZ2UgcmVjb25uZWN0aW9uXG4gICAgICAgICAgICAgIGlmKG5vZGVUb0F0dGFjaCl7XG4gICAgICAgICAgICAgICAgdmFyIG5ld1NvdXJjZSA9IChtb3ZlZEVuZFBvaW50ID09IDApID8gbm9kZVRvQXR0YWNoIDogZWRnZS5zb3VyY2UoKTtcbiAgICAgICAgICAgICAgICB2YXIgbmV3VGFyZ2V0ID0gKG1vdmVkRW5kUG9pbnQgPT0gMSkgPyBub2RlVG9BdHRhY2ggOiBlZGdlLnRhcmdldCgpO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiB2YWxpZGF0ZUVkZ2UgPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB2YWxpZGF0ZUVkZ2UoZWRnZSwgbmV3U291cmNlLCBuZXdUYXJnZXQpO1xuICAgICAgICAgICAgICAgIG5ld05vZGUgPSAoaXNWYWxpZCA9PT0gJ3ZhbGlkJykgPyBub2RlVG9BdHRhY2ggOiBkZXRhY2hlZE5vZGU7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICB2YXIgbmV3U291cmNlID0gKG1vdmVkRW5kUG9pbnQgPT0gMCkgPyBuZXdOb2RlIDogZWRnZS5zb3VyY2UoKTtcbiAgICAgICAgICAgICAgdmFyIG5ld1RhcmdldCA9IChtb3ZlZEVuZFBvaW50ID09IDEpID8gbmV3Tm9kZSA6IGVkZ2UudGFyZ2V0KCk7XG4gICAgICAgICAgICAgIGVkZ2UgPSByZWNvbm5lY3Rpb25VdGlsaXRpZXMuY29ubmVjdEVkZ2UoZWRnZSwgZGV0YWNoZWROb2RlLCBsb2NhdGlvbik7XG5cbiAgICAgICAgICAgICAgaWYoZGV0YWNoZWROb2RlLmlkKCkgIT09IG5ld05vZGUuaWQoKSl7XG4gICAgICAgICAgICAgICAgLy8gdXNlIGdpdmVuIGhhbmRsZVJlY29ubmVjdEVkZ2UgZnVuY3Rpb24gXG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIGhhbmRsZVJlY29ubmVjdEVkZ2UgPT09ICdmdW5jdGlvbicpe1xuICAgICAgICAgICAgICAgICAgdmFyIHJlY29ubmVjdGVkRWRnZSA9IGhhbmRsZVJlY29ubmVjdEVkZ2UobmV3U291cmNlLmlkKCksIG5ld1RhcmdldC5pZCgpLCBlZGdlLmRhdGEoKSk7XG4gICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgIGlmKHJlY29ubmVjdGVkRWRnZSl7XG4gICAgICAgICAgICAgICAgICAgIHJlY29ubmVjdGlvblV0aWxpdGllcy5jb3B5RWRnZShlZGdlLCByZWNvbm5lY3RlZEVkZ2UpO1xuICAgICAgICAgICAgICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5pbml0QW5jaG9yUG9pbnRzKG9wdGlvbnMoKS5iZW5kUG9zaXRpb25zRnVuY3Rpb24sIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMoKS5jb250cm9sUG9zaXRpb25zRnVuY3Rpb24sIFtyZWNvbm5lY3RlZEVkZ2VdKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgaWYocmVjb25uZWN0ZWRFZGdlICYmIG9wdGlvbnMoKS51bmRvYWJsZSl7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgbmV3RWRnZTogcmVjb25uZWN0ZWRFZGdlLFxuICAgICAgICAgICAgICAgICAgICAgIG9sZEVkZ2U6IGVkZ2VcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgY3kudW5kb1JlZG8oKS5kbygncmVtb3ZlUmVjb25uZWN0ZWRFZGdlJywgcGFyYW1zKTtcbiAgICAgICAgICAgICAgICAgICAgZWRnZSA9IHJlY29ubmVjdGVkRWRnZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYocmVjb25uZWN0ZWRFZGdlKXtcbiAgICAgICAgICAgICAgICAgICAgY3kucmVtb3ZlKGVkZ2UpO1xuICAgICAgICAgICAgICAgICAgICBlZGdlID0gcmVjb25uZWN0ZWRFZGdlO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgICAgdmFyIGxvYyA9IChtb3ZlZEVuZFBvaW50ID09IDApID8ge3NvdXJjZTogbmV3Tm9kZS5pZCgpfSA6IHt0YXJnZXQ6IG5ld05vZGUuaWQoKX07XG4gICAgICAgICAgICAgICAgICB2YXIgb2xkTG9jID0gKG1vdmVkRW5kUG9pbnQgPT0gMCkgPyB7c291cmNlOiBkZXRhY2hlZE5vZGUuaWQoKX0gOiB7dGFyZ2V0OiBkZXRhY2hlZE5vZGUuaWQoKX07XG4gICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgIGlmKG9wdGlvbnMoKS51bmRvYWJsZSAmJiBuZXdOb2RlLmlkKCkgIT09IGRldGFjaGVkTm9kZS5pZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJhbSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICBlZGdlOiBlZGdlLFxuICAgICAgICAgICAgICAgICAgICAgIGxvY2F0aW9uOiBsb2MsXG4gICAgICAgICAgICAgICAgICAgICAgb2xkTG9jOiBvbGRMb2NcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGN5LnVuZG9SZWRvKCkuZG8oJ3JlY29ubmVjdEVkZ2UnLCBwYXJhbSk7XG4gICAgICAgICAgICAgICAgICAgIGVkZ2UgPSByZXN1bHQuZWRnZTtcbiAgICAgICAgICAgICAgICAgICAgLy9lZGdlLnNlbGVjdCgpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gIFxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8gaW52YWxpZCBlZGdlIHJlY29ubmVjdGlvbiBjYWxsYmFja1xuICAgICAgICAgICAgICBpZihpc1ZhbGlkICE9PSAndmFsaWQnICYmIHR5cGVvZiBhY3RPblVuc3VjY2Vzc2Z1bFJlY29ubmVjdGlvbiA9PT0gJ2Z1bmN0aW9uJyl7XG4gICAgICAgICAgICAgICAgYWN0T25VbnN1Y2Nlc3NmdWxSZWNvbm5lY3Rpb24oKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBlZGdlLnNlbGVjdCgpO1xuICAgICAgICAgICAgICBjeS5yZW1vdmUoZHVtbXlOb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdmFyIHR5cGUgPSBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRFZGdlVHlwZShlZGdlKTtcblxuICAgICAgICAgIC8vIHRvIGF2b2lkIGVycm9yc1xuICAgICAgICAgIGlmKHR5cGUgPT09ICdub25lJyl7XG4gICAgICAgICAgICB0eXBlID0gJ2JlbmQnO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmKGFuY2hvck1hbmFnZXIudG91Y2hlZEFuY2hvckluZGV4ID09PSB1bmRlZmluZWQgJiYgIWFuY2hvckNyZWF0ZWRCeURyYWcpe1xuICAgICAgICAgICAgbW92ZUFuY2hvclBhcmFtID0gdW5kZWZpbmVkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciB3ZWlnaHRTdHIgPSBhbmNob3JQb2ludFV0aWxpdGllcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddO1xuICAgICAgICAgIGlmIChlZGdlICE9PSB1bmRlZmluZWQgJiYgbW92ZUFuY2hvclBhcmFtICE9PSB1bmRlZmluZWQgJiYgXG4gICAgICAgICAgICAoZWRnZS5kYXRhKHdlaWdodFN0cikgPyBlZGdlLmRhdGEod2VpZ2h0U3RyKS50b1N0cmluZygpIDogbnVsbCkgIT0gbW92ZUFuY2hvclBhcmFtLndlaWdodHMudG9TdHJpbmcoKSkge1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBhbmNob3IgY3JlYXRlZCBmcm9tIGRyYWdcbiAgICAgICAgICAgIGlmKGFuY2hvckNyZWF0ZWRCeURyYWcpe1xuICAgICAgICAgICAgZWRnZS5zZWxlY3QoKTsgXG5cbiAgICAgICAgICAgIC8vIHN0b3BzIHRoZSB1bmJ1bmRsZWQgYmV6aWVyIGVkZ2VzIGZyb20gYmVpbmcgdW5zZWxlY3RlZFxuICAgICAgICAgICAgY3kuYXV0b3Vuc2VsZWN0aWZ5KHRydWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihvcHRpb25zKCkudW5kb2FibGUpIHtcbiAgICAgICAgICAgICAgY3kudW5kb1JlZG8oKS5kbygnY2hhbmdlQW5jaG9yUG9pbnRzJywgbW92ZUFuY2hvclBhcmFtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgbW92ZWRBbmNob3JJbmRleCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICBtb3ZlZEVkZ2UgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgbW92ZUFuY2hvclBhcmFtID0gdW5kZWZpbmVkO1xuICAgICAgICAgIGNyZWF0ZUFuY2hvck9uRHJhZyA9IHVuZGVmaW5lZDtcbiAgICAgICAgICBtb3ZlZEVuZFBvaW50ID0gdW5kZWZpbmVkO1xuICAgICAgICAgIGR1bW15Tm9kZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICBkZXRhY2hlZE5vZGUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgbm9kZVRvQXR0YWNoID0gdW5kZWZpbmVkO1xuICAgICAgICAgIHRhcFN0YXJ0UG9zID0gdW5kZWZpbmVkO1xuICAgICAgICAgIGFuY2hvckNyZWF0ZWRCeURyYWcgPSBmYWxzZTtcblxuICAgICAgICAgIGFuY2hvck1hbmFnZXIudG91Y2hlZEFuY2hvckluZGV4ID0gdW5kZWZpbmVkOyBcblxuICAgICAgICAgIHJlc2V0R2VzdHVyZXMoKTtcbiAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7cmVmcmVzaERyYXdzKCl9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vVmFyaWFibGVzIHVzZWQgZm9yIHN0YXJ0aW5nIGFuZCBlbmRpbmcgdGhlIG1vdmVtZW50IG9mIGFuY2hvciBwb2ludHMgd2l0aCBhcnJvd3NcbiAgICAgICAgdmFyIG1vdmVhbmNob3JwYXJhbTtcbiAgICAgICAgdmFyIGZpcnN0QW5jaG9yO1xuICAgICAgICB2YXIgZWRnZUNvbnRhaW5pbmdGaXJzdEFuY2hvcjtcbiAgICAgICAgdmFyIGZpcnN0QW5jaG9yUG9pbnRGb3VuZDtcbiAgICAgICAgY3kub24oXCJlZGdlZWRpdGluZy5tb3Zlc3RhcnRcIiwgZnVuY3Rpb24gKGUsIGVkZ2VzKSB7XG4gICAgICAgICAgICBmaXJzdEFuY2hvclBvaW50Rm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmIChlZGdlc1swXSAhPSB1bmRlZmluZWQpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZWRnZXMuZm9yRWFjaChmdW5jdGlvbiggZWRnZSApe1xuICAgICAgICAgICAgICAgICAgaWYgKGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEFuY2hvcnNBc0FycmF5KGVkZ2UpICE9IHVuZGVmaW5lZCAmJiAhZmlyc3RBbmNob3JQb2ludEZvdW5kKVxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIGZpcnN0QW5jaG9yID0geyB4OiBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRBbmNob3JzQXNBcnJheShlZGdlKVswXSwgeTogYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0QW5jaG9yc0FzQXJyYXkoZWRnZSlbMV19O1xuICAgICAgICAgICAgICAgICAgICAgIG1vdmVhbmNob3JwYXJhbSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZmlyc3RUaW1lOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBmaXJzdEFuY2hvclBvc2l0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBmaXJzdEFuY2hvci54LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogZmlyc3RBbmNob3IueVxuICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICBlZGdlczogZWRnZXNcbiAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgIGVkZ2VDb250YWluaW5nRmlyc3RBbmNob3IgPSBlZGdlO1xuICAgICAgICAgICAgICAgICAgICAgIGZpcnN0QW5jaG9yUG9pbnRGb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGN5Lm9uKFwiZWRnZWVkaXRpbmcubW92ZWVuZFwiLCBmdW5jdGlvbiAoZSwgZWRnZXMpIHtcbiAgICAgICAgICAgIGlmIChtb3ZlYW5jaG9ycGFyYW0gIT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZhciBpbml0aWFsUG9zID0gbW92ZWFuY2hvcnBhcmFtLmZpcnN0QW5jaG9yUG9zaXRpb247XG4gICAgICAgICAgICAgICAgdmFyIG1vdmVkRmlyc3RBbmNob3IgPSB7XG4gICAgICAgICAgICAgICAgICAgIHg6IGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEFuY2hvcnNBc0FycmF5KGVkZ2VDb250YWluaW5nRmlyc3RBbmNob3IpWzBdLFxuICAgICAgICAgICAgICAgICAgICB5OiBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRBbmNob3JzQXNBcnJheShlZGdlQ29udGFpbmluZ0ZpcnN0QW5jaG9yKVsxXVxuICAgICAgICAgICAgICAgIH07XG5cblxuICAgICAgICAgICAgICAgIG1vdmVhbmNob3JwYXJhbS5wb3NpdGlvbkRpZmYgPSB7XG4gICAgICAgICAgICAgICAgICAgIHg6IC1tb3ZlZEZpcnN0QW5jaG9yLnggKyBpbml0aWFsUG9zLngsXG4gICAgICAgICAgICAgICAgICAgIHk6IC1tb3ZlZEZpcnN0QW5jaG9yLnkgKyBpbml0aWFsUG9zLnlcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBkZWxldGUgbW92ZWFuY2hvcnBhcmFtLmZpcnN0QW5jaG9yUG9zaXRpb247XG5cbiAgICAgICAgICAgICAgICBpZihvcHRpb25zKCkudW5kb2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3kudW5kb1JlZG8oKS5kbyhcIm1vdmVBbmNob3JQb2ludHNcIiwgbW92ZWFuY2hvcnBhcmFtKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtb3ZlYW5jaG9ycGFyYW0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGN5Lm9uKCdjeHR0YXAnLCBlQ3h0VGFwID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgdmFyIHRhcmdldCA9IGV2ZW50LnRhcmdldCB8fCBldmVudC5jeVRhcmdldDtcbiAgICAgICAgICB2YXIgdGFyZ2V0SXNFZGdlID0gZmFsc2U7XG5cbiAgICAgICAgICB0cnl7XG4gICAgICAgICAgICB0YXJnZXRJc0VkZ2UgPSB0YXJnZXQuaXNFZGdlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNhdGNoKGVycil7XG4gICAgICAgICAgICAvLyB0aGlzIGlzIGhlcmUganVzdCB0byBzdXBwcmVzcyB0aGUgZXJyb3JcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2YXIgZWRnZSwgdHlwZTtcbiAgICAgICAgICBpZih0YXJnZXRJc0VkZ2Upe1xuICAgICAgICAgICAgZWRnZSA9IHRhcmdldDtcbiAgICAgICAgICAgIHR5cGUgPSBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRFZGdlVHlwZShlZGdlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgIGVkZ2UgPSBhbmNob3JNYW5hZ2VyLmVkZ2U7ICAgICAgICAgIFxuICAgICAgICAgICAgdHlwZSA9IGFuY2hvck1hbmFnZXIuZWRnZVR5cGU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIG1lbnVzID0gY3kuY29udGV4dE1lbnVzKCdnZXQnKTsgLy8gZ2V0IGNvbnRleHQgbWVudXMgaW5zdGFuY2VcbiAgICAgICAgICBcbiAgICAgICAgICBpZighZWRnZVRvSGlnaGxpZ2h0IHx8IGVkZ2VUb0hpZ2hsaWdodC5pZCgpICE9IGVkZ2UuaWQoKSB8fCBhbmNob3JQb2ludFV0aWxpdGllcy5pc0lnbm9yZWRFZGdlKGVkZ2UpIHx8XG4gICAgICAgICAgICAgIGVkZ2VUb0hpZ2hsaWdodCAhPT0gZWRnZSkge1xuICAgICAgICAgICAgbWVudXMuaGlkZU1lbnVJdGVtKHJlbW92ZUJlbmRQb2ludEN4dE1lbnVJZCk7XG4gICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0oYWRkQmVuZFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgIG1lbnVzLmhpZGVNZW51SXRlbShyZW1vdmVDb250cm9sUG9pbnRDeHRNZW51SWQpO1xuICAgICAgICAgICAgbWVudXMuaGlkZU1lbnVJdGVtKGFkZENvbnRyb2xQb2ludEN4dE1lbnVJZCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIGN5UG9zID0gZXZlbnQucG9zaXRpb24gfHwgZXZlbnQuY3lQb3NpdGlvbjtcbiAgICAgICAgICB2YXIgc2VsZWN0ZWRJbmRleCA9IGdldENvbnRhaW5pbmdTaGFwZUluZGV4KGN5UG9zLngsIGN5UG9zLnksIGVkZ2UpO1xuICAgICAgICAgIC8vIG5vdCBjbGlja2VkIG9uIGFuIGFuY2hvclxuICAgICAgICAgIGlmIChzZWxlY3RlZEluZGV4ID09IC0xKSB7XG4gICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0ocmVtb3ZlQmVuZFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgIG1lbnVzLmhpZGVNZW51SXRlbShyZW1vdmVDb250cm9sUG9pbnRDeHRNZW51SWQpO1xuICAgICAgICAgICAgaWYodHlwZSA9PT0gJ2NvbnRyb2wnICYmIHRhcmdldElzRWRnZSl7XG4gICAgICAgICAgICAgIG1lbnVzLnNob3dNZW51SXRlbShhZGRDb250cm9sUG9pbnRDeHRNZW51SWQpO1xuICAgICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0oYWRkQmVuZFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYodHlwZSA9PT0gJ2JlbmQnICYmIHRhcmdldElzRWRnZSl7XG4gICAgICAgICAgICAgIG1lbnVzLnNob3dNZW51SXRlbShhZGRCZW5kUG9pbnRDeHRNZW51SWQpO1xuICAgICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0oYWRkQ29udHJvbFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRhcmdldElzRWRnZSl7XG4gICAgICAgICAgICAgIG1lbnVzLnNob3dNZW51SXRlbShhZGRCZW5kUG9pbnRDeHRNZW51SWQpO1xuICAgICAgICAgICAgICBtZW51cy5zaG93TWVudUl0ZW0oYWRkQ29udHJvbFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0oYWRkQmVuZFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgICAgbWVudXMuaGlkZU1lbnVJdGVtKGFkZENvbnRyb2xQb2ludEN4dE1lbnVJZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5jdXJyZW50Q3R4UG9zID0gY3lQb3M7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGNsaWNrZWQgb24gYW4gYW5jaG9yXG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0oYWRkQmVuZFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgIG1lbnVzLmhpZGVNZW51SXRlbShhZGRDb250cm9sUG9pbnRDeHRNZW51SWQpO1xuICAgICAgICAgICAgaWYodHlwZSA9PT0gJ2NvbnRyb2wnKXtcbiAgICAgICAgICAgICAgbWVudXMuc2hvd01lbnVJdGVtKHJlbW92ZUNvbnRyb2xQb2ludEN4dE1lbnVJZCk7XG4gICAgICAgICAgICAgIG1lbnVzLmhpZGVNZW51SXRlbShyZW1vdmVCZW5kUG9pbnRDeHRNZW51SWQpO1xuICAgICAgICAgICAgICBpZiAob3B0cy5lbmFibGVNdWx0aXBsZUFuY2hvclJlbW92YWxPcHRpb24gJiYgXG4gICAgICAgICAgICAgICAgICBlZGdlLmhhc0NsYXNzKCdlZGdlY29udHJvbGVkaXRpbmctaGFzbXVsdGlwbGVjb250cm9scG9pbnRzJykpIHtcbiAgICAgICAgICAgICAgICBtZW51cy5zaG93TWVudUl0ZW0ocmVtb3ZlQWxsQ29udHJvbFBvaW50Q3R4TWVudUlkKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZih0eXBlID09PSAnYmVuZCcpe1xuICAgICAgICAgICAgICBtZW51cy5zaG93TWVudUl0ZW0ocmVtb3ZlQmVuZFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgICAgbWVudXMuaGlkZU1lbnVJdGVtKHJlbW92ZUNvbnRyb2xQb2ludEN4dE1lbnVJZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICBtZW51cy5oaWRlTWVudUl0ZW0ocmVtb3ZlQmVuZFBvaW50Q3h0TWVudUlkKTtcbiAgICAgICAgICAgICAgbWVudXMuaGlkZU1lbnVJdGVtKHJlbW92ZUNvbnRyb2xQb2ludEN4dE1lbnVJZCk7XG4gICAgICAgICAgICAgIG1lbnVzLmhpZGVNZW51SXRlbShyZW1vdmVBbGxDb250cm9sUG9pbnRDdHhNZW51SWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYW5jaG9yUG9pbnRVdGlsaXRpZXMuY3VycmVudEFuY2hvckluZGV4ID0gc2VsZWN0ZWRJbmRleDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5jdXJyZW50Q3R4RWRnZSA9IGVkZ2U7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgY3kub24oJ2N5ZWRnZWVkaXRpbmcuY2hhbmdlQW5jaG9yUG9pbnRzJywgJ2VkZ2UnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICB2YXIgZWRnZSA9IHRoaXM7XG4gICAgICAgICAgY3kuc3RhcnRCYXRjaCgpO1xuICAgICAgICAgIGN5LmVkZ2VzKCkudW5zZWxlY3QoKTsgXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIC8vIExpc3RlbmVyIGRlZmluZWQgaW4gb3RoZXIgZXh0ZW5zaW9uXG4gICAgICAgICAgLy8gTWlnaHQgaGF2ZSBjb21wYXRpYmlsaXR5IGlzc3VlcyBhZnRlciB0aGUgdW5idW5kbGVkIGJlemllciAgICBcbiAgICAgICAgICBjeS50cmlnZ2VyKCdiZW5kUG9pbnRNb3ZlbWVudCcpOyAgICBcbiAgICAgICAgICBcbiAgICAgICAgICBjeS5lbmRCYXRjaCgpOyAgICAgICAgICBcbiAgICAgICAgICByZWZyZXNoRHJhd3MoKTtcbiAgICAgICAgXG4gICAgICAgICAgXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB2YXIgc2VsZWN0ZWRFZGdlcztcbiAgICAgIHZhciBhbmNob3JzTW92aW5nID0gZmFsc2U7XG5cbiAgICAgIC8vIHRyYWNrIGFycm93IGtleSBwcmVzc2VzLCBkZWZhdWx0IGZhbHNlXG4gICAgICAvLyBldmVudC5rZXlDb2RlIG5vcm1hbGx5IHJldHVybnMgbnVtYmVyXG4gICAgICAvLyBidXQgSlMgd2lsbCBjb252ZXJ0IHRvIHN0cmluZyBhbnl3YXlcbiAgICAgIHZhciBrZXlzID0ge1xuICAgICAgICAnMzcnOiBmYWxzZSxcbiAgICAgICAgJzM4JzogZmFsc2UsXG4gICAgICAgICczOSc6IGZhbHNlLFxuICAgICAgICAnNDAnOiBmYWxzZVxuICAgICAgfTtcblxuICAgICAgZnVuY3Rpb24ga2V5RG93bihlKSB7XG5cbiAgICAgICAgICB2YXIgc2hvdWxkTW92ZSA9IHR5cGVvZiBvcHRpb25zKCkubW92ZVNlbGVjdGVkQW5jaG9yc09uS2V5RXZlbnRzID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgID8gb3B0aW9ucygpLm1vdmVTZWxlY3RlZEFuY2hvcnNPbktleUV2ZW50cygpIDogb3B0aW9ucygpLm1vdmVTZWxlY3RlZEFuY2hvcnNPbktleUV2ZW50cztcblxuICAgICAgICAgIGlmICghc2hvdWxkTW92ZSkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy9DaGVja3MgaWYgdGhlIHRhZ25hbWUgaXMgdGV4dGFyZWEgb3IgaW5wdXRcbiAgICAgICAgICB2YXIgdG4gPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50LnRhZ05hbWU7XG4gICAgICAgICAgaWYgKHRuICE9IFwiVEVYVEFSRUFcIiAmJiB0biAhPSBcIklOUFVUXCIpXG4gICAgICAgICAge1xuICAgICAgICAgICAgICBzd2l0Y2goZS5rZXlDb2RlKXtcbiAgICAgICAgICAgICAgICAgIGNhc2UgMzc6IGNhc2UgMzk6IGNhc2UgMzg6ICBjYXNlIDQwOiAvLyBBcnJvdyBrZXlzXG4gICAgICAgICAgICAgICAgICBjYXNlIDMyOiBlLnByZXZlbnREZWZhdWx0KCk7IGJyZWFrOyAvLyBTcGFjZVxuICAgICAgICAgICAgICAgICAgZGVmYXVsdDogYnJlYWs7IC8vIGRvIG5vdCBibG9jayBvdGhlciBrZXlzXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKGUua2V5Q29kZSA8ICczNycgfHwgZS5rZXlDb2RlID4gJzQwJykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGtleXNbZS5rZXlDb2RlXSA9IHRydWU7XG5cbiAgICAgICAgICAgICAgLy9DaGVja3MgaWYgb25seSBlZGdlcyBhcmUgc2VsZWN0ZWQgKG5vdCBhbnkgbm9kZSkgYW5kIGlmIG9ubHkgMSBlZGdlIGlzIHNlbGVjdGVkXG4gICAgICAgICAgICAgIC8vSWYgdGhlIHNlY29uZCBjaGVja2luZyBpcyByZW1vdmVkIHRoZSBhbmNob3JzIG9mIG11bHRpcGxlIGVkZ2VzIHdvdWxkIG1vdmVcbiAgICAgICAgICAgICAgaWYgKGN5LmVkZ2VzKFwiOnNlbGVjdGVkXCIpLmxlbmd0aCAhPSBjeS5lbGVtZW50cyhcIjpzZWxlY3RlZFwiKS5sZW5ndGggfHwgY3kuZWRnZXMoXCI6c2VsZWN0ZWRcIikubGVuZ3RoICE9IDEpXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFhbmNob3JzTW92aW5nKVxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEVkZ2VzID0gY3kuZWRnZXMoJzpzZWxlY3RlZCcpO1xuICAgICAgICAgICAgICAgICAgY3kudHJpZ2dlcihcImVkZ2VlZGl0aW5nLm1vdmVzdGFydFwiLCBbc2VsZWN0ZWRFZGdlc10pO1xuICAgICAgICAgICAgICAgICAgYW5jaG9yc01vdmluZyA9IHRydWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFyIG1vdmVTcGVlZCA9IDM7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBkb2Vzbid0IG1ha2Ugc2Vuc2UgaWYgYWx0IGFuZCBzaGlmdCBib3RoIHByZXNzZWRcbiAgICAgICAgICAgICAgaWYoZS5hbHRLZXkgJiYgZS5zaGlmdEtleSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBlbHNlIGlmIChlLmFsdEtleSkge1xuICAgICAgICAgICAgICAgIG1vdmVTcGVlZCA9IDE7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgZWxzZSBpZiAoZS5zaGlmdEtleSkge1xuICAgICAgICAgICAgICAgIG1vdmVTcGVlZCA9IDEwO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIHVwQXJyb3dDb2RlID0gMzg7XG4gICAgICAgICAgICAgIHZhciBkb3duQXJyb3dDb2RlID0gNDA7XG4gICAgICAgICAgICAgIHZhciBsZWZ0QXJyb3dDb2RlID0gMzc7XG4gICAgICAgICAgICAgIHZhciByaWdodEFycm93Q29kZSA9IDM5O1xuXG4gICAgICAgICAgICAgIHZhciBkeCA9IDA7XG4gICAgICAgICAgICAgIHZhciBkeSA9IDA7XG5cbiAgICAgICAgICAgICAgZHggKz0ga2V5c1tyaWdodEFycm93Q29kZV0gPyBtb3ZlU3BlZWQgOiAwO1xuICAgICAgICAgICAgICBkeCAtPSBrZXlzW2xlZnRBcnJvd0NvZGVdID8gbW92ZVNwZWVkIDogMDtcbiAgICAgICAgICAgICAgZHkgKz0ga2V5c1tkb3duQXJyb3dDb2RlXSA/IG1vdmVTcGVlZCA6IDA7XG4gICAgICAgICAgICAgIGR5IC09IGtleXNbdXBBcnJvd0NvZGVdID8gbW92ZVNwZWVkIDogMDtcblxuICAgICAgICAgICAgICBtb3ZlQW5jaG9yUG9pbnRzKHt4OmR4LCB5OmR5fSwgc2VsZWN0ZWRFZGdlcyk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICAgICAgZnVuY3Rpb24ga2V5VXAoZSkge1xuXG4gICAgICAgICAgaWYgKGUua2V5Q29kZSA8ICczNycgfHwgZS5rZXlDb2RlID4gJzQwJykge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICBrZXlzW2Uua2V5Q29kZV0gPSBmYWxzZTtcbiAgICAgICAgICB2YXIgc2hvdWxkTW92ZSA9IHR5cGVvZiBvcHRpb25zKCkubW92ZVNlbGVjdGVkQW5jaG9yc09uS2V5RXZlbnRzID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgID8gb3B0aW9ucygpLm1vdmVTZWxlY3RlZEFuY2hvcnNPbktleUV2ZW50cygpIDogb3B0aW9ucygpLm1vdmVTZWxlY3RlZEFuY2hvcnNPbktleUV2ZW50cztcblxuICAgICAgICAgIGlmICghc2hvdWxkTW92ZSkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY3kudHJpZ2dlcihcImVkZ2VlZGl0aW5nLm1vdmVlbmRcIiwgW3NlbGVjdGVkRWRnZXNdKTtcbiAgICAgICAgICBzZWxlY3RlZEVkZ2VzID0gdW5kZWZpbmVkO1xuICAgICAgICAgIGFuY2hvcnNNb3ZpbmcgPSBmYWxzZTtcblxuICAgICAgfVxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIixrZXlEb3duLCB0cnVlKTtcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLGtleVVwLCB0cnVlKTtcblxuICAgICAgJGNvbnRhaW5lci5kYXRhKCdjeWVkZ2VlZGl0aW5nJywgZGF0YSk7XG4gICAgfSxcbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY3kub2ZmKCdyZW1vdmUnLCAnbm9kZScsIGVSZW1vdmUpXG4gICAgICAgICAgLm9mZignYWRkJywgJ25vZGUnLCBlQWRkKVxuICAgICAgICAgIC5vZmYoJ3N0eWxlJywgJ2VkZ2UuZWRnZWJlbmRlZGl0aW5nLWhhc2JlbmRwb2ludHM6c2VsZWN0ZWQsIGVkZ2UuZWRnZWNvbnRyb2xlZGl0aW5nLWhhc2NvbnRyb2xwb2ludHM6c2VsZWN0ZWQnLCBlU3R5bGUpXG4gICAgICAgICAgLm9mZignc2VsZWN0JywgJ2VkZ2UnLCBlU2VsZWN0KVxuICAgICAgICAgIC5vZmYoJ3Vuc2VsZWN0JywgJ2VkZ2UnLCBlVW5zZWxlY3QpXG4gICAgICAgICAgLm9mZigndGFwc3RhcnQnLCBlVGFwU3RhcnQpXG4gICAgICAgICAgLm9mZigndGFwc3RhcnQnLCAnZWRnZScsIGVUYXBTdGFydE9uRWRnZSlcbiAgICAgICAgICAub2ZmKCd0YXBkcmFnJywgZVRhcERyYWcpXG4gICAgICAgICAgLm9mZigndGFwZW5kJywgZVRhcEVuZClcbiAgICAgICAgICAub2ZmKCdjeHR0YXAnLCBlQ3h0VGFwKVxuICAgICAgICAgIC5vZmYoJ2RyYWcnLCAnbm9kZScsZURyYWcpXG4gICAgICAgICAgLm9mZignZGF0YScsICdlZGdlJywgZURhdGEpO1xuXG4gICAgICAgIGN5LnVuYmluZChcInpvb20gcGFuXCIsIGVab29tKTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKGZ1bmN0aW9uc1tmbl0pIHtcbiAgICByZXR1cm4gZnVuY3Rpb25zW2ZuXS5hcHBseSgkKGN5LmNvbnRhaW5lcigpKSwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGZuID09ICdvYmplY3QnIHx8ICFmbikge1xuICAgIHJldHVybiBmdW5jdGlvbnMuaW5pdC5hcHBseSgkKGN5LmNvbnRhaW5lcigpKSwgYXJndW1lbnRzKTtcbiAgfSBlbHNlIHtcbiAgICAkLmVycm9yKCdObyBzdWNoIGZ1bmN0aW9uIGAnICsgZm4gKyAnYCBmb3IgY3l0b3NjYXBlLmpzLWVkZ2UtZWRpdGluZycpO1xuICB9XG5cbiAgcmV0dXJuICQodGhpcyk7XG59O1xuIiwidmFyIGFuY2hvclBvaW50VXRpbGl0aWVzID0ge1xuICBvcHRpb25zOiB1bmRlZmluZWQsXG4gIGN1cnJlbnRDdHhFZGdlOiB1bmRlZmluZWQsXG4gIGN1cnJlbnRDdHhQb3M6IHVuZGVmaW5lZCxcbiAgY3VycmVudEFuY2hvckluZGV4OiB1bmRlZmluZWQsXG4gIGlnbm9yZWRDbGFzc2VzOiB1bmRlZmluZWQsXG4gIHNldElnbm9yZWRDbGFzc2VzOiBmdW5jdGlvbihfaWdub3JlZENsYXNzZXMpIHtcbiAgICB0aGlzLmlnbm9yZWRDbGFzc2VzID0gX2lnbm9yZWRDbGFzc2VzO1xuICB9LFxuICBzeW50YXg6IHtcbiAgICBiZW5kOiB7XG4gICAgICBlZGdlOiBcInNlZ21lbnRzXCIsXG4gICAgICBjbGFzczogXCJlZGdlYmVuZGVkaXRpbmctaGFzYmVuZHBvaW50c1wiLFxuICAgICAgbXVsdGlDbGFzczogXCJlZGdlYmVuZGVkaXRpbmctaGFzbXVsdGlwbGViZW5kcG9pbnRzXCIsXG4gICAgICB3ZWlnaHQ6IFwiY3llZGdlYmVuZGVkaXRpbmdXZWlnaHRzXCIsXG4gICAgICBkaXN0YW5jZTogXCJjeWVkZ2ViZW5kZWRpdGluZ0Rpc3RhbmNlc1wiLFxuICAgICAgd2VpZ2h0Q3NzOiBcInNlZ21lbnQtd2VpZ2h0c1wiLFxuICAgICAgZGlzdGFuY2VDc3M6IFwic2VnbWVudC1kaXN0YW5jZXNcIixcbiAgICB9LFxuICAgIGNvbnRyb2w6IHtcbiAgICAgIGVkZ2U6IFwidW5idW5kbGVkLWJlemllclwiLFxuICAgICAgY2xhc3M6IFwiZWRnZWNvbnRyb2xlZGl0aW5nLWhhc2NvbnRyb2xwb2ludHNcIixcbiAgICAgIG11bHRpQ2xhc3M6IFwiZWRnZWNvbnRyb2xlZGl0aW5nLWhhc211bHRpcGxlY29udHJvbHBvaW50c1wiLFxuICAgICAgd2VpZ2h0OiBcImN5ZWRnZWNvbnRyb2xlZGl0aW5nV2VpZ2h0c1wiLFxuICAgICAgZGlzdGFuY2U6IFwiY3llZGdlY29udHJvbGVkaXRpbmdEaXN0YW5jZXNcIixcbiAgICAgIHdlaWdodENzczogXCJjb250cm9sLXBvaW50LXdlaWdodHNcIixcbiAgICAgIGRpc3RhbmNlQ3NzOiBcImNvbnRyb2wtcG9pbnQtZGlzdGFuY2VzXCIsXG4gICAgfVxuICB9LFxuICAvLyBnZXRzIGVkZ2UgdHlwZSBhcyAnYmVuZCcgb3IgJ2NvbnRyb2wnXG4gIC8vIHRoZSBpbnRlcmNoYW5naW5nIGlmLXMgYXJlIG5lY2Vzc2FyeSB0byBzZXQgdGhlIHByaW9yaXR5IG9mIHRoZSB0YWdzXG4gIC8vIGV4YW1wbGU6IGFuIGVkZ2Ugd2l0aCB0eXBlIHNlZ21lbnQgYW5kIGEgY2xhc3MgJ2hhc2NvbnRyb2xwb2ludHMnIHdpbGwgYmUgY2xhc3NpZmllZCBhcyB1bmJ1bmRsZWQgYmV6aWVyXG4gIGdldEVkZ2VUeXBlOiBmdW5jdGlvbihlZGdlKXtcbiAgICBpZighZWRnZSlcbiAgICAgIHJldHVybiAnbm9uZSc7XG4gICAgZWxzZSBpZihlZGdlLmhhc0NsYXNzKHRoaXMuc3ludGF4WydiZW5kJ11bJ2NsYXNzJ10pKVxuICAgICAgcmV0dXJuICdiZW5kJztcbiAgICBlbHNlIGlmKGVkZ2UuaGFzQ2xhc3ModGhpcy5zeW50YXhbJ2NvbnRyb2wnXVsnY2xhc3MnXSkpXG4gICAgICByZXR1cm4gJ2NvbnRyb2wnO1xuICAgIGVsc2UgaWYoZWRnZS5jc3MoJ2N1cnZlLXN0eWxlJykgPT09IHRoaXMuc3ludGF4WydiZW5kJ11bJ2VkZ2UnXSlcbiAgICAgIHJldHVybiAnYmVuZCc7XG4gICAgZWxzZSBpZihlZGdlLmNzcygnY3VydmUtc3R5bGUnKSA9PT0gdGhpcy5zeW50YXhbJ2NvbnRyb2wnXVsnZWRnZSddKVxuICAgICAgcmV0dXJuICdjb250cm9sJztcbiAgICBlbHNlIGlmKHRoaXMub3B0aW9ucy5iZW5kUG9zaXRpb25zRnVuY3Rpb24oZWRnZSkgJiYgXG4gICAgICAgICAgICB0aGlzLm9wdGlvbnMuYmVuZFBvc2l0aW9uc0Z1bmN0aW9uKGVkZ2UpLmxlbmd0aCA+IDApXG4gICAgICByZXR1cm4gJ2JlbmQnO1xuICAgIGVsc2UgaWYodGhpcy5vcHRpb25zLmNvbnRyb2xQb3NpdGlvbnNGdW5jdGlvbihlZGdlKSAmJiBcbiAgICAgICAgICAgIHRoaXMub3B0aW9ucy5jb250cm9sUG9zaXRpb25zRnVuY3Rpb24oZWRnZSkubGVuZ3RoID4gMClcbiAgICAgIHJldHVybiAnY29udHJvbCc7XG4gICAgcmV0dXJuICdub25lJztcbiAgfSxcbiAgLy8gaW5pdGlsaXplIGFuY2hvciBwb2ludHMgYmFzZWQgb24gYmVuZFBvc2l0aW9uc0ZjbiBhbmQgY29udHJvbFBvc2l0aW9uRmNuXG4gIGluaXRBbmNob3JQb2ludHM6IGZ1bmN0aW9uKGJlbmRQb3NpdGlvbnNGY24sIGNvbnRyb2xQb3NpdGlvbnNGY24sIGVkZ2VzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlZGdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGVkZ2UgPSBlZGdlc1tpXTtcbiAgICAgIHZhciB0eXBlID0gdGhpcy5nZXRFZGdlVHlwZShlZGdlKTtcbiAgICAgIFxuICAgICAgaWYgKHR5cGUgPT09ICdub25lJykgeyBcbiAgICAgICAgY29udGludWU7IFxuICAgICAgfVxuXG4gICAgICBpZighdGhpcy5pc0lnbm9yZWRFZGdlKGVkZ2UpKSB7XG5cbiAgICAgICAgdmFyIGFuY2hvclBvc2l0aW9ucztcblxuICAgICAgICAvLyBnZXQgdGhlIGFuY2hvciBwb3NpdGlvbnMgYnkgYXBwbHlpbmcgdGhlIGZ1bmN0aW9ucyBmb3IgdGhpcyBlZGdlXG4gICAgICAgIGlmKHR5cGUgPT09ICdiZW5kJylcbiAgICAgICAgICBhbmNob3JQb3NpdGlvbnMgPSBiZW5kUG9zaXRpb25zRmNuLmFwcGx5KHRoaXMsIGVkZ2UpO1xuICAgICAgICBlbHNlIGlmKHR5cGUgPT09ICdjb250cm9sJylcbiAgICAgICAgICBhbmNob3JQb3NpdGlvbnMgPSBjb250cm9sUG9zaXRpb25zRmNuLmFwcGx5KHRoaXMsIGVkZ2UpO1xuXG4gICAgICAgIHZhciByZXN1bHQgPSB7XG4gICAgICAgICAgd2VpZ2h0czogW10sXG4gICAgICAgICAgZGlzdGFuY2VzOiBbXVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChhbmNob3JQb3NpdGlvbnMpIHtcbiAgICAgICAgICByZXN1bHQgPSB0aGlzLmNvbnZlcnRUb1JlbGF0aXZlUG9zaXRpb25zKGVkZ2UsIGFuY2hvclBvc2l0aW9ucyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgdmFyIHdlaWdodHMgPSBlZGdlLmRhdGEodGhpcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddKTtcbiAgICAgICAgICB2YXIgZGlzdGFuY2VzID0gZWRnZS5kYXRhKHRoaXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZSddKTtcbiAgICAgICAgICBpZiAod2VpZ2h0cyAmJiBkaXN0YW5jZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgICAgICAgd2VpZ2h0czogd2VpZ2h0cyxcbiAgICAgICAgICAgICAgZGlzdGFuY2VzOiBkaXN0YW5jZXNcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlcmUgYXJlIGFuY2hvcnMgc2V0IHdlaWdodHMgYW5kIGRpc3RhbmNlcyBhY2NvcmRpbmdseSBhbmQgYWRkIGNsYXNzIHRvIGVuYWJsZSBzdHlsZSBjaGFuZ2VzXG4gICAgICAgIGlmIChyZXN1bHQuZGlzdGFuY2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBlZGdlLmRhdGEodGhpcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddLCByZXN1bHQud2VpZ2h0cyk7XG4gICAgICAgICAgZWRnZS5kYXRhKHRoaXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZSddLCByZXN1bHQuZGlzdGFuY2VzKTtcbiAgICAgICAgICBlZGdlLmFkZENsYXNzKHRoaXMuc3ludGF4W3R5cGVdWydjbGFzcyddKTtcbiAgICAgICAgICBpZiAocmVzdWx0LmRpc3RhbmNlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICBlZGdlLmFkZENsYXNzKHRoaXMuc3ludGF4W3R5cGVdWydtdWx0aUNsYXNzJ10pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBlZGdlLmRhdGEodGhpcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddLCBbXSk7XG4gICAgICAgICAgZWRnZS5kYXRhKHRoaXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZSddLCBbXSk7XG4gICAgICAgICAgaWYgKGVkZ2UuaGFzQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ2NsYXNzJ10pKVxuICAgICAgICAgICAgZWRnZS5yZW1vdmVDbGFzcyh0aGlzLnN5bnRheFt0eXBlXVsnY2xhc3MnXSk7XG4gICAgICAgICAgaWYgKGVkZ2UuaGFzQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ211bHRpQ2xhc3MnXSkpXG4gICAgICAgICAgICBlZGdlLnJlbW92ZUNsYXNzKHRoaXMuc3ludGF4W3R5cGVdWydtdWx0aUNsYXNzJ10pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIGlzSWdub3JlZEVkZ2U6IGZ1bmN0aW9uKGVkZ2UpIHtcblxuICAgIHZhciBzdGFydFggPSBlZGdlLnNvdXJjZSgpLnBvc2l0aW9uKCd4Jyk7XG4gICAgdmFyIHN0YXJ0WSA9IGVkZ2Uuc291cmNlKCkucG9zaXRpb24oJ3knKTtcbiAgICB2YXIgZW5kWCA9IGVkZ2UudGFyZ2V0KCkucG9zaXRpb24oJ3gnKTtcbiAgICB2YXIgZW5kWSA9IGVkZ2UudGFyZ2V0KCkucG9zaXRpb24oJ3knKTtcbiAgIFxuICAgIGlmKChzdGFydFggPT0gZW5kWCAmJiBzdGFydFkgPT0gZW5kWSkgIHx8IChlZGdlLnNvdXJjZSgpLmlkKCkgPT0gZWRnZS50YXJnZXQoKS5pZCgpKSl7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgZm9yKHZhciBpID0gMDsgdGhpcy5pZ25vcmVkQ2xhc3NlcyAmJiBpIDwgIHRoaXMuaWdub3JlZENsYXNzZXMubGVuZ3RoOyBpKyspe1xuICAgICAgaWYoZWRnZS5oYXNDbGFzcyh0aGlzLmlnbm9yZWRDbGFzc2VzW2ldKSlcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfSxcbiAgLy9HZXQgdGhlIGRpcmVjdGlvbiBvZiB0aGUgbGluZSBmcm9tIHNvdXJjZSBwb2ludCB0byB0aGUgdGFyZ2V0IHBvaW50XG4gIGdldExpbmVEaXJlY3Rpb246IGZ1bmN0aW9uKHNyY1BvaW50LCB0Z3RQb2ludCl7XG4gICAgaWYoc3JjUG9pbnQueSA9PSB0Z3RQb2ludC55ICYmIHNyY1BvaW50LnggPCB0Z3RQb2ludC54KXtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cbiAgICBpZihzcmNQb2ludC55IDwgdGd0UG9pbnQueSAmJiBzcmNQb2ludC54IDwgdGd0UG9pbnQueCl7XG4gICAgICByZXR1cm4gMjtcbiAgICB9XG4gICAgaWYoc3JjUG9pbnQueSA8IHRndFBvaW50LnkgJiYgc3JjUG9pbnQueCA9PSB0Z3RQb2ludC54KXtcbiAgICAgIHJldHVybiAzO1xuICAgIH1cbiAgICBpZihzcmNQb2ludC55IDwgdGd0UG9pbnQueSAmJiBzcmNQb2ludC54ID4gdGd0UG9pbnQueCl7XG4gICAgICByZXR1cm4gNDtcbiAgICB9XG4gICAgaWYoc3JjUG9pbnQueSA9PSB0Z3RQb2ludC55ICYmIHNyY1BvaW50LnggPiB0Z3RQb2ludC54KXtcbiAgICAgIHJldHVybiA1O1xuICAgIH1cbiAgICBpZihzcmNQb2ludC55ID4gdGd0UG9pbnQueSAmJiBzcmNQb2ludC54ID4gdGd0UG9pbnQueCl7XG4gICAgICByZXR1cm4gNjtcbiAgICB9XG4gICAgaWYoc3JjUG9pbnQueSA+IHRndFBvaW50LnkgJiYgc3JjUG9pbnQueCA9PSB0Z3RQb2ludC54KXtcbiAgICAgIHJldHVybiA3O1xuICAgIH1cbiAgICByZXR1cm4gODsvL2lmIHNyY1BvaW50LnkgPiB0Z3RQb2ludC55IGFuZCBzcmNQb2ludC54IDwgdGd0UG9pbnQueFxuICB9LFxuICBnZXRTcmNUZ3RQb2ludHNBbmRUYW5nZW50czogZnVuY3Rpb24gKGVkZ2UpIHtcbiAgICB2YXIgc291cmNlTm9kZSA9IGVkZ2Uuc291cmNlKCk7XG4gICAgdmFyIHRhcmdldE5vZGUgPSBlZGdlLnRhcmdldCgpO1xuICAgIFxuICAgIHZhciB0Z3RQb3NpdGlvbiA9IHRhcmdldE5vZGUucG9zaXRpb24oKTtcbiAgICB2YXIgc3JjUG9zaXRpb24gPSBzb3VyY2VOb2RlLnBvc2l0aW9uKCk7XG4gICAgXG4gICAgdmFyIHNyY1BvaW50ID0gc291cmNlTm9kZS5wb3NpdGlvbigpO1xuICAgIHZhciB0Z3RQb2ludCA9IHRhcmdldE5vZGUucG9zaXRpb24oKTtcblxuXG4gICAgdmFyIG0xID0gKHRndFBvaW50LnkgLSBzcmNQb2ludC55KSAvICh0Z3RQb2ludC54IC0gc3JjUG9pbnQueCk7XG4gICAgdmFyIG0yID0gLTEgLyBtMTtcblxuICAgIHJldHVybiB7XG4gICAgICBtMTogbTEsXG4gICAgICBtMjogbTIsXG4gICAgICBzcmNQb2ludDogc3JjUG9pbnQsXG4gICAgICB0Z3RQb2ludDogdGd0UG9pbnRcbiAgICB9O1xuICB9LFxuICBnZXRJbnRlcnNlY3Rpb246IGZ1bmN0aW9uKGVkZ2UsIHBvaW50LCBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cyl7XG4gICAgaWYgKHNyY1RndFBvaW50c0FuZFRhbmdlbnRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNyY1RndFBvaW50c0FuZFRhbmdlbnRzID0gdGhpcy5nZXRTcmNUZ3RQb2ludHNBbmRUYW5nZW50cyhlZGdlKTtcbiAgICB9XG5cbiAgICB2YXIgc3JjUG9pbnQgPSBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cy5zcmNQb2ludDtcbiAgICB2YXIgdGd0UG9pbnQgPSBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cy50Z3RQb2ludDtcbiAgICB2YXIgbTEgPSBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cy5tMTtcbiAgICB2YXIgbTIgPSBzcmNUZ3RQb2ludHNBbmRUYW5nZW50cy5tMjtcblxuICAgIHZhciBpbnRlcnNlY3RYO1xuICAgIHZhciBpbnRlcnNlY3RZO1xuXG4gICAgaWYobTEgPT0gSW5maW5pdHkgfHwgbTEgPT0gLUluZmluaXR5KXtcbiAgICAgIGludGVyc2VjdFggPSBzcmNQb2ludC54O1xuICAgICAgaW50ZXJzZWN0WSA9IHBvaW50Lnk7XG4gICAgfVxuICAgIGVsc2UgaWYobTEgPT0gMCl7XG4gICAgICBpbnRlcnNlY3RYID0gcG9pbnQueDtcbiAgICAgIGludGVyc2VjdFkgPSBzcmNQb2ludC55O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciBhMSA9IHNyY1BvaW50LnkgLSBtMSAqIHNyY1BvaW50Lng7XG4gICAgICB2YXIgYTIgPSBwb2ludC55IC0gbTIgKiBwb2ludC54O1xuXG4gICAgICBpbnRlcnNlY3RYID0gKGEyIC0gYTEpIC8gKG0xIC0gbTIpO1xuICAgICAgaW50ZXJzZWN0WSA9IG0xICogaW50ZXJzZWN0WCArIGExO1xuICAgIH1cblxuICAgIC8vSW50ZXJzZWN0aW9uIHBvaW50IGlzIHRoZSBpbnRlcnNlY3Rpb24gb2YgdGhlIGxpbmVzIHBhc3NpbmcgdGhyb3VnaCB0aGUgbm9kZXMgYW5kXG4gICAgLy9wYXNzaW5nIHRocm91Z2ggdGhlIGJlbmQgb3IgY29udHJvbCBwb2ludCBhbmQgcGVycGVuZGljdWxhciB0byB0aGUgb3RoZXIgbGluZVxuICAgIHZhciBpbnRlcnNlY3Rpb25Qb2ludCA9IHtcbiAgICAgIHg6IGludGVyc2VjdFgsXG4gICAgICB5OiBpbnRlcnNlY3RZXG4gICAgfTtcbiAgICBcbiAgICByZXR1cm4gaW50ZXJzZWN0aW9uUG9pbnQ7XG4gIH0sXG4gIGdldEFuY2hvcnNBc0FycmF5OiBmdW5jdGlvbihlZGdlKSB7XG4gICAgdmFyIHR5cGUgPSB0aGlzLmdldEVkZ2VUeXBlKGVkZ2UpO1xuXG4gICAgaWYodHlwZSA9PT0gJ25vbmUnKXtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIFxuICAgIGlmKCBlZGdlLmNzcygnY3VydmUtc3R5bGUnKSAhPT0gdGhpcy5zeW50YXhbdHlwZV1bJ2VkZ2UnXSApIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIFxuICAgIHZhciBhbmNob3JMaXN0ID0gW107XG5cbiAgICB2YXIgd2VpZ2h0cyA9IGVkZ2UucHN0eWxlKCB0aGlzLnN5bnRheFt0eXBlXVsnd2VpZ2h0Q3NzJ10gKSA/IFxuICAgICAgICAgICAgICAgICAgZWRnZS5wc3R5bGUoIHRoaXMuc3ludGF4W3R5cGVdWyd3ZWlnaHRDc3MnXSApLnBmVmFsdWUgOiBbXTtcbiAgICB2YXIgZGlzdGFuY2VzID0gZWRnZS5wc3R5bGUoIHRoaXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZUNzcyddICkgPyBcbiAgICAgICAgICAgICAgICAgIGVkZ2UucHN0eWxlKCB0aGlzLnN5bnRheFt0eXBlXVsnZGlzdGFuY2VDc3MnXSApLnBmVmFsdWUgOiBbXTtcbiAgICB2YXIgbWluTGVuZ3RocyA9IE1hdGgubWluKCB3ZWlnaHRzLmxlbmd0aCwgZGlzdGFuY2VzLmxlbmd0aCApO1xuICAgIFxuICAgIHZhciBzcmNQb3MgPSBlZGdlLnNvdXJjZSgpLnBvc2l0aW9uKCk7XG4gICAgdmFyIHRndFBvcyA9IGVkZ2UudGFyZ2V0KCkucG9zaXRpb24oKTtcblxuICAgIHZhciBkeSA9ICggdGd0UG9zLnkgLSBzcmNQb3MueSApO1xuICAgIHZhciBkeCA9ICggdGd0UG9zLnggLSBzcmNQb3MueCApO1xuICAgIFxuICAgIHZhciBsID0gTWF0aC5zcXJ0KCBkeCAqIGR4ICsgZHkgKiBkeSApO1xuXG4gICAgdmFyIHZlY3RvciA9IHtcbiAgICAgIHg6IGR4LFxuICAgICAgeTogZHlcbiAgICB9O1xuXG4gICAgdmFyIHZlY3Rvck5vcm0gPSB7XG4gICAgICB4OiB2ZWN0b3IueCAvIGwsXG4gICAgICB5OiB2ZWN0b3IueSAvIGxcbiAgICB9O1xuICAgIFxuICAgIHZhciB2ZWN0b3JOb3JtSW52ZXJzZSA9IHtcbiAgICAgIHg6IC12ZWN0b3JOb3JtLnksXG4gICAgICB5OiB2ZWN0b3JOb3JtLnhcbiAgICB9O1xuXG4gICAgZm9yKCB2YXIgcyA9IDA7IHMgPCBtaW5MZW5ndGhzOyBzKysgKXtcbiAgICAgIHZhciB3ID0gd2VpZ2h0c1sgcyBdO1xuICAgICAgdmFyIGQgPSBkaXN0YW5jZXNbIHMgXTtcblxuICAgICAgdmFyIHcxID0gKDEgLSB3KTtcbiAgICAgIHZhciB3MiA9IHc7XG5cbiAgICAgIHZhciBwb3NQdHMgPSB7XG4gICAgICAgIHgxOiBzcmNQb3MueCxcbiAgICAgICAgeDI6IHRndFBvcy54LFxuICAgICAgICB5MTogc3JjUG9zLnksXG4gICAgICAgIHkyOiB0Z3RQb3MueVxuICAgICAgfTtcblxuICAgICAgdmFyIG1pZHB0UHRzID0gcG9zUHRzO1xuICAgICAgXG4gICAgICB2YXIgYWRqdXN0ZWRNaWRwdCA9IHtcbiAgICAgICAgeDogbWlkcHRQdHMueDEgKiB3MSArIG1pZHB0UHRzLngyICogdzIsXG4gICAgICAgIHk6IG1pZHB0UHRzLnkxICogdzEgKyBtaWRwdFB0cy55MiAqIHcyXG4gICAgICB9O1xuXG4gICAgICBhbmNob3JMaXN0LnB1c2goXG4gICAgICAgIGFkanVzdGVkTWlkcHQueCArIHZlY3Rvck5vcm1JbnZlcnNlLnggKiBkLFxuICAgICAgICBhZGp1c3RlZE1pZHB0LnkgKyB2ZWN0b3JOb3JtSW52ZXJzZS55ICogZFxuICAgICAgKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGFuY2hvckxpc3Q7XG4gIH0sXG4gIGNvbnZlcnRUb1JlbGF0aXZlUG9zaXRpb246IGZ1bmN0aW9uIChlZGdlLCBwb2ludCwgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMpIHtcbiAgICBpZiAoc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMgPSB0aGlzLmdldFNyY1RndFBvaW50c0FuZFRhbmdlbnRzKGVkZ2UpO1xuICAgIH1cbiAgICBcbiAgICB2YXIgaW50ZXJzZWN0aW9uUG9pbnQgPSB0aGlzLmdldEludGVyc2VjdGlvbihlZGdlLCBwb2ludCwgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMpO1xuICAgIHZhciBpbnRlcnNlY3RYID0gaW50ZXJzZWN0aW9uUG9pbnQueDtcbiAgICB2YXIgaW50ZXJzZWN0WSA9IGludGVyc2VjdGlvblBvaW50Lnk7XG4gICAgXG4gICAgdmFyIHNyY1BvaW50ID0gc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMuc3JjUG9pbnQ7XG4gICAgdmFyIHRndFBvaW50ID0gc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMudGd0UG9pbnQ7XG4gICAgXG4gICAgdmFyIHdlaWdodDtcbiAgICBcbiAgICBpZiggaW50ZXJzZWN0WCAhPSBzcmNQb2ludC54ICkge1xuICAgICAgd2VpZ2h0ID0gKGludGVyc2VjdFggLSBzcmNQb2ludC54KSAvICh0Z3RQb2ludC54IC0gc3JjUG9pbnQueCk7XG4gICAgfVxuICAgIGVsc2UgaWYoIGludGVyc2VjdFkgIT0gc3JjUG9pbnQueSApIHtcbiAgICAgIHdlaWdodCA9IChpbnRlcnNlY3RZIC0gc3JjUG9pbnQueSkgLyAodGd0UG9pbnQueSAtIHNyY1BvaW50LnkpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHdlaWdodCA9IDA7XG4gICAgfVxuICAgIFxuICAgIHZhciBkaXN0YW5jZSA9IE1hdGguc3FydChNYXRoLnBvdygoaW50ZXJzZWN0WSAtIHBvaW50LnkpLCAyKVxuICAgICAgICArIE1hdGgucG93KChpbnRlcnNlY3RYIC0gcG9pbnQueCksIDIpKTtcbiAgICBcbiAgICAvL0dldCB0aGUgZGlyZWN0aW9uIG9mIHRoZSBsaW5lIGZvcm0gc291cmNlIHBvaW50IHRvIHRhcmdldCBwb2ludFxuICAgIHZhciBkaXJlY3Rpb24xID0gdGhpcy5nZXRMaW5lRGlyZWN0aW9uKHNyY1BvaW50LCB0Z3RQb2ludCk7XG4gICAgLy9HZXQgdGhlIGRpcmVjdGlvbiBvZiB0aGUgbGluZSBmcm9tIGludGVzZWN0aW9uIHBvaW50IHRvIHRoZSBwb2ludFxuICAgIHZhciBkaXJlY3Rpb24yID0gdGhpcy5nZXRMaW5lRGlyZWN0aW9uKGludGVyc2VjdGlvblBvaW50LCBwb2ludCk7XG4gICAgXG4gICAgLy9JZiB0aGUgZGlmZmVyZW5jZSBpcyBub3QgLTIgYW5kIG5vdCA2IHRoZW4gdGhlIGRpcmVjdGlvbiBvZiB0aGUgZGlzdGFuY2UgaXMgbmVnYXRpdmVcbiAgICBpZihkaXJlY3Rpb24xIC0gZGlyZWN0aW9uMiAhPSAtMiAmJiBkaXJlY3Rpb24xIC0gZGlyZWN0aW9uMiAhPSA2KXtcbiAgICAgIGlmKGRpc3RhbmNlICE9IDApXG4gICAgICAgIGRpc3RhbmNlID0gLTEgKiBkaXN0YW5jZTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIHdlaWdodDogd2VpZ2h0LFxuICAgICAgZGlzdGFuY2U6IGRpc3RhbmNlXG4gICAgfTtcbiAgfSxcbiAgY29udmVydFRvUmVsYXRpdmVQb3NpdGlvbnM6IGZ1bmN0aW9uIChlZGdlLCBhbmNob3JQb2ludHMpIHtcbiAgICB2YXIgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMgPSB0aGlzLmdldFNyY1RndFBvaW50c0FuZFRhbmdlbnRzKGVkZ2UpO1xuXG4gICAgdmFyIHdlaWdodHMgPSBbXTtcbiAgICB2YXIgZGlzdGFuY2VzID0gW107XG5cbiAgICBmb3IgKHZhciBpID0gMDsgYW5jaG9yUG9pbnRzICYmIGkgPCBhbmNob3JQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBhbmNob3IgPSBhbmNob3JQb2ludHNbaV07XG4gICAgICB2YXIgcmVsYXRpdmVBbmNob3JQb3NpdGlvbiA9IHRoaXMuY29udmVydFRvUmVsYXRpdmVQb3NpdGlvbihlZGdlLCBhbmNob3IsIHNyY1RndFBvaW50c0FuZFRhbmdlbnRzKTtcblxuICAgICAgd2VpZ2h0cy5wdXNoKHJlbGF0aXZlQW5jaG9yUG9zaXRpb24ud2VpZ2h0KTtcbiAgICAgIGRpc3RhbmNlcy5wdXNoKHJlbGF0aXZlQW5jaG9yUG9zaXRpb24uZGlzdGFuY2UpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICB3ZWlnaHRzOiB3ZWlnaHRzLFxuICAgICAgZGlzdGFuY2VzOiBkaXN0YW5jZXNcbiAgICB9O1xuICB9LFxuICBnZXREaXN0YW5jZXNTdHJpbmc6IGZ1bmN0aW9uIChlZGdlLCB0eXBlKSB7XG4gICAgdmFyIHN0ciA9IFwiXCI7XG5cbiAgICB2YXIgZGlzdGFuY2VzID0gZWRnZS5kYXRhKHRoaXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZSddKTtcbiAgICBmb3IgKHZhciBpID0gMDsgZGlzdGFuY2VzICYmIGkgPCBkaXN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHN0ciA9IHN0ciArIFwiIFwiICsgZGlzdGFuY2VzW2ldO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc3RyO1xuICB9LFxuICBnZXRXZWlnaHRzU3RyaW5nOiBmdW5jdGlvbiAoZWRnZSwgdHlwZSkge1xuICAgIHZhciBzdHIgPSBcIlwiO1xuXG4gICAgdmFyIHdlaWdodHMgPSBlZGdlLmRhdGEodGhpcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddKTtcbiAgICBmb3IgKHZhciBpID0gMDsgd2VpZ2h0cyAmJiBpIDwgd2VpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgICAgc3RyID0gc3RyICsgXCIgXCIgKyB3ZWlnaHRzW2ldO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc3RyO1xuICB9LFxuICBhZGRBbmNob3JQb2ludDogZnVuY3Rpb24oZWRnZSwgbmV3QW5jaG9yUG9pbnQsIHR5cGUgPSB1bmRlZmluZWQpIHtcbiAgICBpZihlZGdlID09PSB1bmRlZmluZWQgfHwgbmV3QW5jaG9yUG9pbnQgPT09IHVuZGVmaW5lZCl7XG4gICAgICBlZGdlID0gdGhpcy5jdXJyZW50Q3R4RWRnZTtcbiAgICAgIG5ld0FuY2hvclBvaW50ID0gdGhpcy5jdXJyZW50Q3R4UG9zO1xuICAgIH1cbiAgXG4gICAgaWYodHlwZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgdHlwZSA9IHRoaXMuZ2V0RWRnZVR5cGUoZWRnZSk7XG5cbiAgICB2YXIgd2VpZ2h0U3RyID0gdGhpcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddO1xuICAgIHZhciBkaXN0YW5jZVN0ciA9IHRoaXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZSddO1xuXG4gICAgdmFyIHJlbGF0aXZlUG9zaXRpb24gPSB0aGlzLmNvbnZlcnRUb1JlbGF0aXZlUG9zaXRpb24oZWRnZSwgbmV3QW5jaG9yUG9pbnQpO1xuICAgIHZhciBvcmlnaW5hbEFuY2hvcldlaWdodCA9IHJlbGF0aXZlUG9zaXRpb24ud2VpZ2h0O1xuICAgIFxuICAgIHZhciBzdGFydFggPSBlZGdlLnNvdXJjZSgpLnBvc2l0aW9uKCd4Jyk7XG4gICAgdmFyIHN0YXJ0WSA9IGVkZ2Uuc291cmNlKCkucG9zaXRpb24oJ3knKTtcbiAgICB2YXIgZW5kWCA9IGVkZ2UudGFyZ2V0KCkucG9zaXRpb24oJ3gnKTtcbiAgICB2YXIgZW5kWSA9IGVkZ2UudGFyZ2V0KCkucG9zaXRpb24oJ3knKTtcbiAgICB2YXIgc3RhcnRXZWlnaHQgPSB0aGlzLmNvbnZlcnRUb1JlbGF0aXZlUG9zaXRpb24oZWRnZSwge3g6IHN0YXJ0WCwgeTogc3RhcnRZfSkud2VpZ2h0O1xuICAgIHZhciBlbmRXZWlnaHQgPSB0aGlzLmNvbnZlcnRUb1JlbGF0aXZlUG9zaXRpb24oZWRnZSwge3g6IGVuZFgsIHk6IGVuZFl9KS53ZWlnaHQ7XG4gICAgdmFyIHdlaWdodHNXaXRoVGd0U3JjID0gW3N0YXJ0V2VpZ2h0XS5jb25jYXQoZWRnZS5kYXRhKHdlaWdodFN0cik/ZWRnZS5kYXRhKHdlaWdodFN0cik6W10pLmNvbmNhdChbZW5kV2VpZ2h0XSk7XG4gICAgXG4gICAgdmFyIGFuY2hvcnNMaXN0ID0gdGhpcy5nZXRBbmNob3JzQXNBcnJheShlZGdlKTtcbiAgICBcbiAgICB2YXIgbWluRGlzdCA9IEluZmluaXR5O1xuICAgIHZhciBpbnRlcnNlY3Rpb247XG4gICAgdmFyIHB0c1dpdGhUZ3RTcmMgPSBbc3RhcnRYLCBzdGFydFldXG4gICAgICAgICAgICAuY29uY2F0KGFuY2hvcnNMaXN0P2FuY2hvcnNMaXN0OltdKVxuICAgICAgICAgICAgLmNvbmNhdChbZW5kWCwgZW5kWV0pO1xuICAgIHZhciBuZXdBbmNob3JJbmRleCA9IC0xO1xuICAgIFxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCB3ZWlnaHRzV2l0aFRndFNyYy5sZW5ndGggLSAxOyBpKyspe1xuICAgICAgdmFyIHcxID0gd2VpZ2h0c1dpdGhUZ3RTcmNbaV07XG4gICAgICB2YXIgdzIgPSB3ZWlnaHRzV2l0aFRndFNyY1tpICsgMV07XG4gICAgICBcbiAgICAgIC8vY2hlY2sgaWYgdGhlIHdlaWdodCBpcyBiZXR3ZWVuIHcxIGFuZCB3MlxuICAgICAgY29uc3QgYjEgPSB0aGlzLmNvbXBhcmVXaXRoUHJlY2lzaW9uKG9yaWdpbmFsQW5jaG9yV2VpZ2h0LCB3MSwgdHJ1ZSk7XG4gICAgICBjb25zdCBiMiA9IHRoaXMuY29tcGFyZVdpdGhQcmVjaXNpb24ob3JpZ2luYWxBbmNob3JXZWlnaHQsIHcyKTtcbiAgICAgIGNvbnN0IGIzID0gdGhpcy5jb21wYXJlV2l0aFByZWNpc2lvbihvcmlnaW5hbEFuY2hvcldlaWdodCwgdzIsIHRydWUpO1xuICAgICAgY29uc3QgYjQgPSB0aGlzLmNvbXBhcmVXaXRoUHJlY2lzaW9uKG9yaWdpbmFsQW5jaG9yV2VpZ2h0LCB3MSk7XG4gICAgICBpZiggKGIxICYmIGIyKSB8fCAoYjMgJiYgYjQpKXtcbiAgICAgICAgdmFyIHN0YXJ0WCA9IHB0c1dpdGhUZ3RTcmNbMiAqIGldO1xuICAgICAgICB2YXIgc3RhcnRZID0gcHRzV2l0aFRndFNyY1syICogaSArIDFdO1xuICAgICAgICB2YXIgZW5kWCA9IHB0c1dpdGhUZ3RTcmNbMiAqIGkgKyAyXTtcbiAgICAgICAgdmFyIGVuZFkgPSBwdHNXaXRoVGd0U3JjWzIgKiBpICsgM107XG4gICAgICAgIFxuICAgICAgICB2YXIgc3RhcnQgPSB7XG4gICAgICAgICAgeDogc3RhcnRYLFxuICAgICAgICAgIHk6IHN0YXJ0WVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgdmFyIGVuZCA9IHtcbiAgICAgICAgICB4OiBlbmRYLFxuICAgICAgICAgIHk6IGVuZFlcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIHZhciBtMSA9ICggc3RhcnRZIC0gZW5kWSApIC8gKCBzdGFydFggLSBlbmRYICk7XG4gICAgICAgIHZhciBtMiA9IC0xIC8gbTE7XG4gICAgICAgIFxuICAgICAgICB2YXIgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMgPSB7XG4gICAgICAgICAgc3JjUG9pbnQ6IHN0YXJ0LFxuICAgICAgICAgIHRndFBvaW50OiBlbmQsXG4gICAgICAgICAgbTE6IG0xLFxuICAgICAgICAgIG0yOiBtMlxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgdmFyIGN1cnJlbnRJbnRlcnNlY3Rpb24gPSB0aGlzLmdldEludGVyc2VjdGlvbihlZGdlLCBuZXdBbmNob3JQb2ludCwgc3JjVGd0UG9pbnRzQW5kVGFuZ2VudHMpO1xuICAgICAgICB2YXIgZGlzdCA9IE1hdGguc3FydCggTWF0aC5wb3coIChuZXdBbmNob3JQb2ludC54IC0gY3VycmVudEludGVyc2VjdGlvbi54KSwgMiApIFxuICAgICAgICAgICAgICAgICsgTWF0aC5wb3coIChuZXdBbmNob3JQb2ludC55IC0gY3VycmVudEludGVyc2VjdGlvbi55KSwgMiApKTtcbiAgICAgICAgXG4gICAgICAgIC8vVXBkYXRlIHRoZSBtaW5pbXVtIGRpc3RhbmNlXG4gICAgICAgIGlmKGRpc3QgPCBtaW5EaXN0KXtcbiAgICAgICAgICBtaW5EaXN0ID0gZGlzdDtcbiAgICAgICAgICBpbnRlcnNlY3Rpb24gPSBjdXJyZW50SW50ZXJzZWN0aW9uO1xuICAgICAgICAgIG5ld0FuY2hvckluZGV4ID0gaTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBpZihpbnRlcnNlY3Rpb24gIT09IHVuZGVmaW5lZCl7XG4gICAgICBuZXdBbmNob3JQb2ludCA9IGludGVyc2VjdGlvbjtcbiAgICB9XG4gICAgXG4gICAgcmVsYXRpdmVQb3NpdGlvbiA9IHRoaXMuY29udmVydFRvUmVsYXRpdmVQb3NpdGlvbihlZGdlLCBuZXdBbmNob3JQb2ludCk7XG4gICAgXG4gICAgaWYoaW50ZXJzZWN0aW9uID09PSB1bmRlZmluZWQpe1xuICAgICAgcmVsYXRpdmVQb3NpdGlvbi5kaXN0YW5jZSA9IDA7XG4gICAgfVxuXG4gICAgdmFyIHdlaWdodHMgPSBlZGdlLmRhdGEod2VpZ2h0U3RyKTtcbiAgICB2YXIgZGlzdGFuY2VzID0gZWRnZS5kYXRhKGRpc3RhbmNlU3RyKTtcbiAgICBcbiAgICB3ZWlnaHRzID0gd2VpZ2h0cz93ZWlnaHRzOltdO1xuICAgIGRpc3RhbmNlcyA9IGRpc3RhbmNlcz9kaXN0YW5jZXM6W107XG4gICAgXG4gICAgaWYod2VpZ2h0cy5sZW5ndGggPT09IDApIHtcbiAgICAgIG5ld0FuY2hvckluZGV4ID0gMDtcbiAgICB9XG4gICAgXG4vLyAgICB3ZWlnaHRzLnB1c2gocmVsYXRpdmVCZW5kUG9zaXRpb24ud2VpZ2h0KTtcbi8vICAgIGRpc3RhbmNlcy5wdXNoKHJlbGF0aXZlQmVuZFBvc2l0aW9uLmRpc3RhbmNlKTtcbiAgICBpZihuZXdBbmNob3JJbmRleCAhPSAtMSl7XG4gICAgICB3ZWlnaHRzLnNwbGljZShuZXdBbmNob3JJbmRleCwgMCwgcmVsYXRpdmVQb3NpdGlvbi53ZWlnaHQpO1xuICAgICAgZGlzdGFuY2VzLnNwbGljZShuZXdBbmNob3JJbmRleCwgMCwgcmVsYXRpdmVQb3NpdGlvbi5kaXN0YW5jZSk7XG4gICAgfVxuICAgXG4gICAgZWRnZS5kYXRhKHdlaWdodFN0ciwgd2VpZ2h0cyk7XG4gICAgZWRnZS5kYXRhKGRpc3RhbmNlU3RyLCBkaXN0YW5jZXMpO1xuICAgIFxuICAgIGVkZ2UuYWRkQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ2NsYXNzJ10pO1xuICAgIGlmICh3ZWlnaHRzLmxlbmd0aCA+IDEgfHwgZGlzdGFuY2VzLmxlbmd0aCA+IDEpIHtcbiAgICAgIGVkZ2UuYWRkQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ211bHRpQ2xhc3MnXSk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBuZXdBbmNob3JJbmRleDtcbiAgfSxcbiAgcmVtb3ZlQW5jaG9yOiBmdW5jdGlvbihlZGdlLCBhbmNob3JJbmRleCl7XG4gICAgaWYoZWRnZSA9PT0gdW5kZWZpbmVkIHx8IGFuY2hvckluZGV4ID09PSB1bmRlZmluZWQpe1xuICAgICAgZWRnZSA9IHRoaXMuY3VycmVudEN0eEVkZ2U7XG4gICAgICBhbmNob3JJbmRleCA9IHRoaXMuY3VycmVudEFuY2hvckluZGV4O1xuICAgIH1cbiAgICBcbiAgICB2YXIgdHlwZSA9IHRoaXMuZ2V0RWRnZVR5cGUoZWRnZSk7XG5cbiAgICBpZih0aGlzLmVkZ2VUeXBlTm9uZVNob3VsZG50SGFwcGVuKHR5cGUsIFwiYW5jaG9yUG9pbnRVdGlsaXRpZXMuanMsIHJlbW92ZUFuY2hvclwiKSl7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGRpc3RhbmNlU3RyID0gdGhpcy5zeW50YXhbdHlwZV1bJ3dlaWdodCddO1xuICAgIHZhciB3ZWlnaHRTdHIgPSB0aGlzLnN5bnRheFt0eXBlXVsnZGlzdGFuY2UnXTtcblxuICAgIHZhciBkaXN0YW5jZXMgPSBlZGdlLmRhdGEoZGlzdGFuY2VTdHIpO1xuICAgIHZhciB3ZWlnaHRzID0gZWRnZS5kYXRhKHdlaWdodFN0cik7XG4gICAgdmFyIHBvc2l0aW9ucztcbiAgICBpZiAodHlwZSA9PT0gJ2JlbmQnKSB7XG4gICAgICBwb3NpdGlvbnMgPSB0aGlzLm9wdGlvbnMuYmVuZFBvc2l0aW9uc0Z1bmN0aW9uKGVkZ2UpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlID09PSAnY29udHJvbCcpIHtcbiAgICAgIHBvc2l0aW9ucyA9IHRoaXMub3B0aW9ucy5jb250cm9sUG9zaXRpb25zRnVuY3Rpb24oZWRnZSk7XG4gICAgfVxuXG4gICAgZGlzdGFuY2VzLnNwbGljZShhbmNob3JJbmRleCwgMSk7XG4gICAgd2VpZ2h0cy5zcGxpY2UoYW5jaG9ySW5kZXgsIDEpO1xuICAgIC8vIHBvc2l0aW9uIGRhdGEgaXMgbm90IGdpdmVuIGluIGRlbW8gc28gaXQgdGhyb3dzIGVycm9yIGhlcmVcbiAgICAvLyBidXQgaXQgc2hvdWxkIGJlIGZyb20gdGhlIGJlZ2lubmluZ1xuICAgIGlmIChwb3NpdGlvbnMpXG4gICAgICBwb3NpdGlvbnMuc3BsaWNlKGFuY2hvckluZGV4LCAxKTtcblxuICAgIC8vIG9ubHkgb25lIGFuY2hvciBwb2ludCBsZWZ0IG9uIGVkZ2VcbiAgICBpZiAoZGlzdGFuY2VzLmxlbmd0aCA9PSAxIHx8IHdlaWdodHMubGVuZ3RoID09IDEpIHtcbiAgICAgIGVkZ2UucmVtb3ZlQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ211bHRpQ2xhc3MnXSlcbiAgICB9XG4gICAgLy8gbm8gbW9yZSBhbmNob3IgcG9pbnRzIG9uIGVkZ2VcbiAgICBlbHNlIGlmKGRpc3RhbmNlcy5sZW5ndGggPT0gMCB8fCB3ZWlnaHRzLmxlbmd0aCA9PSAwKXtcbiAgICAgIGVkZ2UucmVtb3ZlQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ2NsYXNzJ10pO1xuICAgICAgZWRnZS5kYXRhKGRpc3RhbmNlU3RyLCBbXSk7XG4gICAgICBlZGdlLmRhdGEod2VpZ2h0U3RyLCBbXSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgZWRnZS5kYXRhKGRpc3RhbmNlU3RyLCBkaXN0YW5jZXMpO1xuICAgICAgZWRnZS5kYXRhKHdlaWdodFN0ciwgd2VpZ2h0cyk7XG4gICAgfVxuICB9LFxuICByZW1vdmVBbGxBbmNob3JzOiBmdW5jdGlvbihlZGdlKSB7XG4gICAgaWYgKGVkZ2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZWRnZSA9IHRoaXMuY3VycmVudEN0eEVkZ2U7XG4gICAgfVxuICAgIHZhciB0eXBlID0gdGhpcy5nZXRFZGdlVHlwZShlZGdlKTtcbiAgICBcbiAgICBpZih0aGlzLmVkZ2VUeXBlTm9uZVNob3VsZG50SGFwcGVuKHR5cGUsIFwiYW5jaG9yUG9pbnRVdGlsaXRpZXMuanMsIHJlbW92ZUFsbEFuY2hvcnNcIikpe1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBjbGFzc2VzIGZyb20gZWRnZVxuICAgIGVkZ2UucmVtb3ZlQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ2NsYXNzJ10pO1xuICAgIGVkZ2UucmVtb3ZlQ2xhc3ModGhpcy5zeW50YXhbdHlwZV1bJ211bHRpQ2xhc3MnXSk7XG5cbiAgICAvLyBSZW1vdmUgYWxsIGFuY2hvciBwb2ludCBkYXRhIGZyb20gZWRnZVxuICAgIHZhciBkaXN0YW5jZVN0ciA9IHRoaXMuc3ludGF4W3R5cGVdWyd3ZWlnaHQnXTtcbiAgICB2YXIgd2VpZ2h0U3RyID0gdGhpcy5zeW50YXhbdHlwZV1bJ2Rpc3RhbmNlJ107XG4gICAgZWRnZS5kYXRhKGRpc3RhbmNlU3RyLCBbXSk7XG4gICAgZWRnZS5kYXRhKHdlaWdodFN0ciwgW10pO1xuICAgIC8vIHBvc2l0aW9uIGRhdGEgaXMgbm90IGdpdmVuIGluIGRlbW8gc28gaXQgdGhyb3dzIGVycm9yIGhlcmVcbiAgICAvLyBidXQgaXQgc2hvdWxkIGJlIGZyb20gdGhlIGJlZ2lubmluZ1xuICAgIGlmICh0eXBlID09PSAnYmVuZCcgJiYgdGhpcy5vcHRpb25zLmJlbmRQb3NpdGlvbnNGdW5jdGlvbihlZGdlKSkge1xuICAgICAgdGhpcy5vcHRpb25zLmJlbmRQb2ludFBvc2l0aW9uc1NldHRlckZ1bmN0aW9uKGVkZ2UsIFtdKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ2NvbnRyb2wnICYmIHRoaXMub3B0aW9ucy5jb250cm9sUG9zaXRpb25zRnVuY3Rpb24oZWRnZSkpIHtcbiAgICAgIHRoaXMub3B0aW9ucy5jb250cm9sUG9pbnRQb3NpdGlvbnNTZXR0ZXJGdW5jdGlvbihlZGdlLCBbXSk7XG4gICAgfVxuICB9LFxuICBjYWxjdWxhdGVEaXN0YW5jZTogZnVuY3Rpb24ocHQxLCBwdDIpIHtcbiAgICB2YXIgZGlmZlggPSBwdDEueCAtIHB0Mi54O1xuICAgIHZhciBkaWZmWSA9IHB0MS55IC0gcHQyLnk7XG4gICAgXG4gICAgdmFyIGRpc3QgPSBNYXRoLnNxcnQoIE1hdGgucG93KCBkaWZmWCwgMiApICsgTWF0aC5wb3coIGRpZmZZLCAyICkgKTtcbiAgICByZXR1cm4gZGlzdDtcbiAgfSxcbiAgLyoqIChMZXNzIHRoYW4gb3IgZXF1YWwgdG8pIGFuZCAoZ3JlYXRlciB0aGVuIGVxdWFsIHRvKSBjb21wYXJpc29ucyB3aXRoIGZsb2F0aW5nIHBvaW50IG51bWJlcnMgKi9cbiAgY29tcGFyZVdpdGhQcmVjaXNpb246IGZ1bmN0aW9uIChuMSwgbjIsIGlzTGVzc1RoZW5PckVxdWFsID0gZmFsc2UsIHByZWNpc2lvbiA9IDAuMDEpIHtcbiAgICBjb25zdCBkaWZmID0gbjEgLSBuMjtcbiAgICBpZiAoTWF0aC5hYnMoZGlmZikgPD0gcHJlY2lzaW9uKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKGlzTGVzc1RoZW5PckVxdWFsKSB7XG4gICAgICByZXR1cm4gbjEgPCBuMjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG4xID4gbjI7XG4gICAgfVxuICB9LFxuICBlZGdlVHlwZU5vbmVTaG91bGRudEhhcHBlbjogZnVuY3Rpb24odHlwZSwgcGxhY2Upe1xuICAgIGlmKHR5cGUgPT09ICdub25lJykge1xuICAgICAgY29uc29sZS5sb2coYEluICR7cGxhY2V9OiBlZGdlIHR5cGUgbm9uZSBzaG91bGQgbmV2ZXIgaGFwcGVuIGhlcmUhIWApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBhbmNob3JQb2ludFV0aWxpdGllcztcbiIsInZhciBkZWJvdW5jZSA9IChmdW5jdGlvbiAoKSB7XG4gIC8qKlxuICAgKiBsb2Rhc2ggMy4xLjEgKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gICAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAgICogQ29weXJpZ2h0IDIwMTItMjAxNSBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAgICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAgICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICAgKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICAgKi9cbiAgLyoqIFVzZWQgYXMgdGhlIGBUeXBlRXJyb3JgIG1lc3NhZ2UgZm9yIFwiRnVuY3Rpb25zXCIgbWV0aG9kcy4gKi9cbiAgdmFyIEZVTkNfRVJST1JfVEVYVCA9ICdFeHBlY3RlZCBhIGZ1bmN0aW9uJztcblxuICAvKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xuICB2YXIgbmF0aXZlTWF4ID0gTWF0aC5tYXgsXG4gICAgICAgICAgbmF0aXZlTm93ID0gRGF0ZS5ub3c7XG5cbiAgLyoqXG4gICAqIEdldHMgdGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdGhhdCBoYXZlIGVsYXBzZWQgc2luY2UgdGhlIFVuaXggZXBvY2hcbiAgICogKDEgSmFudWFyeSAxOTcwIDAwOjAwOjAwIFVUQykuXG4gICAqXG4gICAqIEBzdGF0aWNcbiAgICogQG1lbWJlck9mIF9cbiAgICogQGNhdGVnb3J5IERhdGVcbiAgICogQGV4YW1wbGVcbiAgICpcbiAgICogXy5kZWZlcihmdW5jdGlvbihzdGFtcCkge1xuICAgKiAgIGNvbnNvbGUubG9nKF8ubm93KCkgLSBzdGFtcCk7XG4gICAqIH0sIF8ubm93KCkpO1xuICAgKiAvLyA9PiBsb2dzIHRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIGl0IHRvb2sgZm9yIHRoZSBkZWZlcnJlZCBmdW5jdGlvbiB0byBiZSBpbnZva2VkXG4gICAqL1xuICB2YXIgbm93ID0gbmF0aXZlTm93IHx8IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH07XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBkZWJvdW5jZWQgZnVuY3Rpb24gdGhhdCBkZWxheXMgaW52b2tpbmcgYGZ1bmNgIHVudGlsIGFmdGVyIGB3YWl0YFxuICAgKiBtaWxsaXNlY29uZHMgaGF2ZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IHRpbWUgdGhlIGRlYm91bmNlZCBmdW5jdGlvbiB3YXNcbiAgICogaW52b2tlZC4gVGhlIGRlYm91bmNlZCBmdW5jdGlvbiBjb21lcyB3aXRoIGEgYGNhbmNlbGAgbWV0aG9kIHRvIGNhbmNlbFxuICAgKiBkZWxheWVkIGludm9jYXRpb25zLiBQcm92aWRlIGFuIG9wdGlvbnMgb2JqZWN0IHRvIGluZGljYXRlIHRoYXQgYGZ1bmNgXG4gICAqIHNob3VsZCBiZSBpbnZva2VkIG9uIHRoZSBsZWFkaW5nIGFuZC9vciB0cmFpbGluZyBlZGdlIG9mIHRoZSBgd2FpdGAgdGltZW91dC5cbiAgICogU3Vic2VxdWVudCBjYWxscyB0byB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uIHJldHVybiB0aGUgcmVzdWx0IG9mIHRoZSBsYXN0XG4gICAqIGBmdW5jYCBpbnZvY2F0aW9uLlxuICAgKlxuICAgKiAqKk5vdGU6KiogSWYgYGxlYWRpbmdgIGFuZCBgdHJhaWxpbmdgIG9wdGlvbnMgYXJlIGB0cnVlYCwgYGZ1bmNgIGlzIGludm9rZWRcbiAgICogb24gdGhlIHRyYWlsaW5nIGVkZ2Ugb2YgdGhlIHRpbWVvdXQgb25seSBpZiB0aGUgdGhlIGRlYm91bmNlZCBmdW5jdGlvbiBpc1xuICAgKiBpbnZva2VkIG1vcmUgdGhhbiBvbmNlIGR1cmluZyB0aGUgYHdhaXRgIHRpbWVvdXQuXG4gICAqXG4gICAqIFNlZSBbRGF2aWQgQ29yYmFjaG8ncyBhcnRpY2xlXShodHRwOi8vZHJ1cGFsbW90aW9uLmNvbS9hcnRpY2xlL2RlYm91bmNlLWFuZC10aHJvdHRsZS12aXN1YWwtZXhwbGFuYXRpb24pXG4gICAqIGZvciBkZXRhaWxzIG92ZXIgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gYF8uZGVib3VuY2VgIGFuZCBgXy50aHJvdHRsZWAuXG4gICAqXG4gICAqIEBzdGF0aWNcbiAgICogQG1lbWJlck9mIF9cbiAgICogQGNhdGVnb3J5IEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGRlYm91bmNlLlxuICAgKiBAcGFyYW0ge251bWJlcn0gW3dhaXQ9MF0gVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gZGVsYXkuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gVGhlIG9wdGlvbnMgb2JqZWN0LlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmxlYWRpbmc9ZmFsc2VdIFNwZWNpZnkgaW52b2tpbmcgb24gdGhlIGxlYWRpbmdcbiAgICogIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gICAqIEBwYXJhbSB7bnVtYmVyfSBbb3B0aW9ucy5tYXhXYWl0XSBUaGUgbWF4aW11bSB0aW1lIGBmdW5jYCBpcyBhbGxvd2VkIHRvIGJlXG4gICAqICBkZWxheWVkIGJlZm9yZSBpdCdzIGludm9rZWQuXG4gICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMudHJhaWxpbmc9dHJ1ZV0gU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgdHJhaWxpbmdcbiAgICogIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gICAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGRlYm91bmNlZCBmdW5jdGlvbi5cbiAgICogQGV4YW1wbGVcbiAgICpcbiAgICogLy8gYXZvaWQgY29zdGx5IGNhbGN1bGF0aW9ucyB3aGlsZSB0aGUgd2luZG93IHNpemUgaXMgaW4gZmx1eFxuICAgKiBqUXVlcnkod2luZG93KS5vbigncmVzaXplJywgXy5kZWJvdW5jZShjYWxjdWxhdGVMYXlvdXQsIDE1MCkpO1xuICAgKlxuICAgKiAvLyBpbnZva2UgYHNlbmRNYWlsYCB3aGVuIHRoZSBjbGljayBldmVudCBpcyBmaXJlZCwgZGVib3VuY2luZyBzdWJzZXF1ZW50IGNhbGxzXG4gICAqIGpRdWVyeSgnI3Bvc3Rib3gnKS5vbignY2xpY2snLCBfLmRlYm91bmNlKHNlbmRNYWlsLCAzMDAsIHtcbiAgICogICAnbGVhZGluZyc6IHRydWUsXG4gICAqICAgJ3RyYWlsaW5nJzogZmFsc2VcbiAgICogfSkpO1xuICAgKlxuICAgKiAvLyBlbnN1cmUgYGJhdGNoTG9nYCBpcyBpbnZva2VkIG9uY2UgYWZ0ZXIgMSBzZWNvbmQgb2YgZGVib3VuY2VkIGNhbGxzXG4gICAqIHZhciBzb3VyY2UgPSBuZXcgRXZlbnRTb3VyY2UoJy9zdHJlYW0nKTtcbiAgICogalF1ZXJ5KHNvdXJjZSkub24oJ21lc3NhZ2UnLCBfLmRlYm91bmNlKGJhdGNoTG9nLCAyNTAsIHtcbiAgICogICAnbWF4V2FpdCc6IDEwMDBcbiAgICogfSkpO1xuICAgKlxuICAgKiAvLyBjYW5jZWwgYSBkZWJvdW5jZWQgY2FsbFxuICAgKiB2YXIgdG9kb0NoYW5nZXMgPSBfLmRlYm91bmNlKGJhdGNoTG9nLCAxMDAwKTtcbiAgICogT2JqZWN0Lm9ic2VydmUobW9kZWxzLnRvZG8sIHRvZG9DaGFuZ2VzKTtcbiAgICpcbiAgICogT2JqZWN0Lm9ic2VydmUobW9kZWxzLCBmdW5jdGlvbihjaGFuZ2VzKSB7XG4gICAqICAgaWYgKF8uZmluZChjaGFuZ2VzLCB7ICd1c2VyJzogJ3RvZG8nLCAndHlwZSc6ICdkZWxldGUnfSkpIHtcbiAgICogICAgIHRvZG9DaGFuZ2VzLmNhbmNlbCgpO1xuICAgKiAgIH1cbiAgICogfSwgWydkZWxldGUnXSk7XG4gICAqXG4gICAqIC8vIC4uLmF0IHNvbWUgcG9pbnQgYG1vZGVscy50b2RvYCBpcyBjaGFuZ2VkXG4gICAqIG1vZGVscy50b2RvLmNvbXBsZXRlZCA9IHRydWU7XG4gICAqXG4gICAqIC8vIC4uLmJlZm9yZSAxIHNlY29uZCBoYXMgcGFzc2VkIGBtb2RlbHMudG9kb2AgaXMgZGVsZXRlZFxuICAgKiAvLyB3aGljaCBjYW5jZWxzIHRoZSBkZWJvdW5jZWQgYHRvZG9DaGFuZ2VzYCBjYWxsXG4gICAqIGRlbGV0ZSBtb2RlbHMudG9kbztcbiAgICovXG4gIGZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgICB2YXIgYXJncyxcbiAgICAgICAgICAgIG1heFRpbWVvdXRJZCxcbiAgICAgICAgICAgIHJlc3VsdCxcbiAgICAgICAgICAgIHN0YW1wLFxuICAgICAgICAgICAgdGhpc0FyZyxcbiAgICAgICAgICAgIHRpbWVvdXRJZCxcbiAgICAgICAgICAgIHRyYWlsaW5nQ2FsbCxcbiAgICAgICAgICAgIGxhc3RDYWxsZWQgPSAwLFxuICAgICAgICAgICAgbWF4V2FpdCA9IGZhbHNlLFxuICAgICAgICAgICAgdHJhaWxpbmcgPSB0cnVlO1xuXG4gICAgaWYgKHR5cGVvZiBmdW5jICE9ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRlVOQ19FUlJPUl9URVhUKTtcbiAgICB9XG4gICAgd2FpdCA9IHdhaXQgPCAwID8gMCA6ICgrd2FpdCB8fCAwKTtcbiAgICBpZiAob3B0aW9ucyA9PT0gdHJ1ZSkge1xuICAgICAgdmFyIGxlYWRpbmcgPSB0cnVlO1xuICAgICAgdHJhaWxpbmcgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICBsZWFkaW5nID0gISFvcHRpb25zLmxlYWRpbmc7XG4gICAgICBtYXhXYWl0ID0gJ21heFdhaXQnIGluIG9wdGlvbnMgJiYgbmF0aXZlTWF4KCtvcHRpb25zLm1heFdhaXQgfHwgMCwgd2FpdCk7XG4gICAgICB0cmFpbGluZyA9ICd0cmFpbGluZycgaW4gb3B0aW9ucyA/ICEhb3B0aW9ucy50cmFpbGluZyA6IHRyYWlsaW5nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbCgpIHtcbiAgICAgIGlmICh0aW1lb3V0SWQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICBpZiAobWF4VGltZW91dElkKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChtYXhUaW1lb3V0SWQpO1xuICAgICAgfVxuICAgICAgbGFzdENhbGxlZCA9IDA7XG4gICAgICBtYXhUaW1lb3V0SWQgPSB0aW1lb3V0SWQgPSB0cmFpbGluZ0NhbGwgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29tcGxldGUoaXNDYWxsZWQsIGlkKSB7XG4gICAgICBpZiAoaWQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICAgIH1cbiAgICAgIG1heFRpbWVvdXRJZCA9IHRpbWVvdXRJZCA9IHRyYWlsaW5nQ2FsbCA9IHVuZGVmaW5lZDtcbiAgICAgIGlmIChpc0NhbGxlZCkge1xuICAgICAgICBsYXN0Q2FsbGVkID0gbm93KCk7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gICAgICAgIGlmICghdGltZW91dElkICYmICFtYXhUaW1lb3V0SWQpIHtcbiAgICAgICAgICBhcmdzID0gdGhpc0FyZyA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlbGF5ZWQoKSB7XG4gICAgICB2YXIgcmVtYWluaW5nID0gd2FpdCAtIChub3coKSAtIHN0YW1wKTtcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gMCB8fCByZW1haW5pbmcgPiB3YWl0KSB7XG4gICAgICAgIGNvbXBsZXRlKHRyYWlsaW5nQ2FsbCwgbWF4VGltZW91dElkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoZGVsYXllZCwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYXhEZWxheWVkKCkge1xuICAgICAgY29tcGxldGUodHJhaWxpbmcsIHRpbWVvdXRJZCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVib3VuY2VkKCkge1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHN0YW1wID0gbm93KCk7XG4gICAgICB0aGlzQXJnID0gdGhpcztcbiAgICAgIHRyYWlsaW5nQ2FsbCA9IHRyYWlsaW5nICYmICh0aW1lb3V0SWQgfHwgIWxlYWRpbmcpO1xuXG4gICAgICBpZiAobWF4V2FpdCA9PT0gZmFsc2UpIHtcbiAgICAgICAgdmFyIGxlYWRpbmdDYWxsID0gbGVhZGluZyAmJiAhdGltZW91dElkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFtYXhUaW1lb3V0SWQgJiYgIWxlYWRpbmcpIHtcbiAgICAgICAgICBsYXN0Q2FsbGVkID0gc3RhbXA7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlbWFpbmluZyA9IG1heFdhaXQgLSAoc3RhbXAgLSBsYXN0Q2FsbGVkKSxcbiAgICAgICAgICAgICAgICBpc0NhbGxlZCA9IHJlbWFpbmluZyA8PSAwIHx8IHJlbWFpbmluZyA+IG1heFdhaXQ7XG5cbiAgICAgICAgaWYgKGlzQ2FsbGVkKSB7XG4gICAgICAgICAgaWYgKG1heFRpbWVvdXRJZCkge1xuICAgICAgICAgICAgbWF4VGltZW91dElkID0gY2xlYXJUaW1lb3V0KG1heFRpbWVvdXRJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGxhc3RDYWxsZWQgPSBzdGFtcDtcbiAgICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KHRoaXNBcmcsIGFyZ3MpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFtYXhUaW1lb3V0SWQpIHtcbiAgICAgICAgICBtYXhUaW1lb3V0SWQgPSBzZXRUaW1lb3V0KG1heERlbGF5ZWQsIHJlbWFpbmluZyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpc0NhbGxlZCAmJiB0aW1lb3V0SWQpIHtcbiAgICAgICAgdGltZW91dElkID0gY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICB9XG4gICAgICBlbHNlIGlmICghdGltZW91dElkICYmIHdhaXQgIT09IG1heFdhaXQpIHtcbiAgICAgICAgdGltZW91dElkID0gc2V0VGltZW91dChkZWxheWVkLCB3YWl0KTtcbiAgICAgIH1cbiAgICAgIGlmIChsZWFkaW5nQ2FsbCkge1xuICAgICAgICBpc0NhbGxlZCA9IHRydWU7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gICAgICB9XG4gICAgICBpZiAoaXNDYWxsZWQgJiYgIXRpbWVvdXRJZCAmJiAhbWF4VGltZW91dElkKSB7XG4gICAgICAgIGFyZ3MgPSB0aGlzQXJnID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBkZWJvdW5jZWQuY2FuY2VsID0gY2FuY2VsO1xuICAgIHJldHVybiBkZWJvdW5jZWQ7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIFtsYW5ndWFnZSB0eXBlXShodHRwczovL2VzNS5naXRodWIuaW8vI3g4KSBvZiBgT2JqZWN0YC5cbiAgICogKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXG4gICAqXG4gICAqIEBzdGF0aWNcbiAgICogQG1lbWJlck9mIF9cbiAgICogQGNhdGVnb3J5IExhbmdcbiAgICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gICAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFuIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICAgKiBAZXhhbXBsZVxuICAgKlxuICAgKiBfLmlzT2JqZWN0KHt9KTtcbiAgICogLy8gPT4gdHJ1ZVxuICAgKlxuICAgKiBfLmlzT2JqZWN0KFsxLCAyLCAzXSk7XG4gICAqIC8vID0+IHRydWVcbiAgICpcbiAgICogXy5pc09iamVjdCgxKTtcbiAgICogLy8gPT4gZmFsc2VcbiAgICovXG4gIGZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gICAgLy8gQXZvaWQgYSBWOCBKSVQgYnVnIGluIENocm9tZSAxOS0yMC5cbiAgICAvLyBTZWUgaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTIyOTEgZm9yIG1vcmUgZGV0YWlscy5cbiAgICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xuICB9XG5cbiAgcmV0dXJuIGRlYm91bmNlO1xuXG59KSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRlYm91bmNlOyIsIjsgKGZ1bmN0aW9uICgpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBhbmNob3JQb2ludFV0aWxpdGllcyA9IHJlcXVpcmUoJy4vYW5jaG9yUG9pbnRVdGlsaXRpZXMnKTtcbiAgdmFyIGRlYm91bmNlID0gcmVxdWlyZShcIi4vZGVib3VuY2VcIik7XG5cbiAgLy8gcmVnaXN0ZXJzIHRoZSBleHRlbnNpb24gb24gYSBjeXRvc2NhcGUgbGliIHJlZlxuICB2YXIgcmVnaXN0ZXIgPSBmdW5jdGlvbiAoY3l0b3NjYXBlLCAkLCBLb252YSkge1xuICAgIHZhciB1aVV0aWxpdGllcyA9IHJlcXVpcmUoJy4vVUlVdGlsaXRpZXMnKTtcblxuICAgIGlmICghY3l0b3NjYXBlIHx8ICEkIHx8ICFLb252YSkgeyByZXR1cm47IH0gLy8gY2FuJ3QgcmVnaXN0ZXIgaWYgcmVxdWlyZWQgbGlicmFyaWVzIHVuc3BlY2lmaWVkXG5cbiAgICB2YXIgZGVmYXVsdHMgPSB7XG4gICAgICAvLyBBIGZ1bmN0aW9uIHBhcmFtZXRlciB0byBnZXQgYmVuZCBwb2ludCBwb3NpdGlvbnMsIHNob3VsZCByZXR1cm4gcG9zaXRpb25zIG9mIGJlbmQgcG9pbnRzXG4gICAgICBiZW5kUG9zaXRpb25zRnVuY3Rpb246IGZ1bmN0aW9uIChlbGUpIHtcbiAgICAgICAgcmV0dXJuIGVsZS5kYXRhKCdiZW5kUG9pbnRQb3NpdGlvbnMnKTtcbiAgICAgIH0sXG4gICAgICAvLyBBIGZ1bmN0aW9uIHBhcmFtZXRlciB0byBnZXQgY29udHJvbCBwb2ludCBwb3NpdGlvbnMsIHNob3VsZCByZXR1cm4gcG9zaXRpb25zIG9mIGNvbnRyb2wgcG9pbnRzXG4gICAgICBjb250cm9sUG9zaXRpb25zRnVuY3Rpb246IGZ1bmN0aW9uIChlbGUpIHtcbiAgICAgICAgcmV0dXJuIGVsZS5kYXRhKCdjb250cm9sUG9pbnRQb3NpdGlvbnMnKTtcbiAgICAgIH0sXG4gICAgICAvLyBBIGZ1bmN0aW9uIHBhcmFtZXRlciB0byBzZXQgYmVuZCBwb2ludCBwb3NpdGlvbnNcbiAgICAgIGJlbmRQb2ludFBvc2l0aW9uc1NldHRlckZ1bmN0aW9uOiBmdW5jdGlvbiAoZWxlLCBiZW5kUG9pbnRQb3NpdGlvbnMpIHtcbiAgICAgICAgZWxlLmRhdGEoJ2JlbmRQb2ludFBvc2l0aW9ucycsIGJlbmRQb2ludFBvc2l0aW9ucyk7XG4gICAgICB9LFxuICAgICAgLy8gQSBmdW5jdGlvbiBwYXJhbWV0ZXIgdG8gc2V0IGJlbmQgcG9pbnQgcG9zaXRpb25zXG4gICAgICBjb250cm9sUG9pbnRQb3NpdGlvbnNTZXR0ZXJGdW5jdGlvbjogZnVuY3Rpb24gKGVsZSwgY29udHJvbFBvaW50UG9zaXRpb25zKSB7XG4gICAgICAgIGVsZS5kYXRhKCdjb250cm9sUG9pbnRQb3NpdGlvbnMnLCBjb250cm9sUG9pbnRQb3NpdGlvbnMpO1xuICAgICAgfSxcbiAgICAgIC8vIHdoZXRoZXIgdG8gaW5pdGlsaXplIGJlbmQgYW5kIGNvbnRyb2wgcG9pbnRzIG9uIGNyZWF0aW9uIG9mIHRoaXMgZXh0ZW5zaW9uIGF1dG9tYXRpY2FsbHlcbiAgICAgIGluaXRBbmNob3JzQXV0b21hdGljYWxseTogdHJ1ZSxcbiAgICAgIC8vIHRoZSBjbGFzc2VzIG9mIHRob3NlIGVkZ2VzIHRoYXQgc2hvdWxkIGJlIGlnbm9yZWRcbiAgICAgIGlnbm9yZWRDbGFzc2VzOiBbXSxcbiAgICAgIC8vIHdoZXRoZXIgdGhlIGJlbmQgYW5kIGNvbnRyb2wgZWRpdGluZyBvcGVyYXRpb25zIGFyZSB1bmRvYWJsZSAocmVxdWlyZXMgY3l0b3NjYXBlLXVuZG8tcmVkby5qcylcbiAgICAgIHVuZG9hYmxlOiBmYWxzZSxcbiAgICAgIC8vIHRoZSBzaXplIG9mIGJlbmQgYW5kIGNvbnRyb2wgcG9pbnQgc2hhcGUgaXMgb2J0YWluZWQgYnkgbXVsdGlwbGluZyB3aWR0aCBvZiBlZGdlIHdpdGggdGhpcyBwYXJhbWV0ZXJcbiAgICAgIGFuY2hvclNoYXBlU2l6ZUZhY3RvcjogMyxcbiAgICAgIC8vIHotaW5kZXggdmFsdWUgb2YgdGhlIGNhbnZhcyBpbiB3aGljaCBiZW5kIGFuZCBjb250cm9sIHBvaW50cyBhcmUgZHJhd25cbiAgICAgIHpJbmRleDogOTk5LFxuICAgICAgLy9BbiBvcHRpb24gdGhhdCBjb250cm9scyB0aGUgZGlzdGFuY2Ugd2l0aGluIHdoaWNoIGEgYmVuZCBwb2ludCBpcyBjb25zaWRlcmVkIFwibmVhclwiIHRoZSBsaW5lIHNlZ21lbnQgYmV0d2VlbiBpdHMgdHdvIG5laWdoYm9ycyBhbmQgd2lsbCBiZSBhdXRvbWF0aWNhbGx5IHJlbW92ZWRcbiAgICAgIGJlbmRSZW1vdmFsU2Vuc2l0aXZpdHk6IDgsXG4gICAgICAvLyB0aXRsZSBvZiBhZGQgYmVuZCBwb2ludCBtZW51IGl0ZW0gKFVzZXIgbWF5IG5lZWQgdG8gYWRqdXN0IHdpZHRoIG9mIG1lbnUgaXRlbXMgYWNjb3JkaW5nIHRvIGxlbmd0aCBvZiB0aGlzIG9wdGlvbilcbiAgICAgIGFkZEJlbmRNZW51SXRlbVRpdGxlOiBcIkFkZCBCZW5kIFBvaW50XCIsXG4gICAgICAvLyB0aXRsZSBvZiByZW1vdmUgYmVuZCBwb2ludCBtZW51IGl0ZW0gKFVzZXIgbWF5IG5lZWQgdG8gYWRqdXN0IHdpZHRoIG9mIG1lbnUgaXRlbXMgYWNjb3JkaW5nIHRvIGxlbmd0aCBvZiB0aGlzIG9wdGlvbilcbiAgICAgIHJlbW92ZUJlbmRNZW51SXRlbVRpdGxlOiBcIlJlbW92ZSBCZW5kIFBvaW50XCIsXG4gICAgICAvLyB0aXRsZSBvZiByZW1vdmUgYWxsIGJlbmQgcG9pbnRzIG1lbnUgaXRlbVxuICAgICAgcmVtb3ZlQWxsQmVuZE1lbnVJdGVtVGl0bGU6IFwiUmVtb3ZlIEFsbCBCZW5kIFBvaW50c1wiLFxuICAgICAgLy8gdGl0bGUgb2YgYWRkIGNvbnRyb2wgcG9pbnQgbWVudSBpdGVtIChVc2VyIG1heSBuZWVkIHRvIGFkanVzdCB3aWR0aCBvZiBtZW51IGl0ZW1zIGFjY29yZGluZyB0byBsZW5ndGggb2YgdGhpcyBvcHRpb24pXG4gICAgICBhZGRDb250cm9sTWVudUl0ZW1UaXRsZTogXCJBZGQgQ29udHJvbCBQb2ludFwiLFxuICAgICAgLy8gdGl0bGUgb2YgcmVtb3ZlIGNvbnRyb2wgcG9pbnQgbWVudSBpdGVtIChVc2VyIG1heSBuZWVkIHRvIGFkanVzdCB3aWR0aCBvZiBtZW51IGl0ZW1zIGFjY29yZGluZyB0byBsZW5ndGggb2YgdGhpcyBvcHRpb24pXG4gICAgICByZW1vdmVDb250cm9sTWVudUl0ZW1UaXRsZTogXCJSZW1vdmUgQ29udHJvbCBQb2ludFwiLFxuICAgICAgLy8gdGl0bGUgb2YgcmVtb3ZlIGFsbCBjb250cm9sIHBvaW50cyBtZW51IGl0ZW1cbiAgICAgIHJlbW92ZUFsbENvbnRyb2xNZW51SXRlbVRpdGxlOiBcIlJlbW92ZSBBbGwgQ29udHJvbCBQb2ludHNcIixcbiAgICAgIC8vIHdoZXRoZXIgdGhlIGJlbmQgYW5kIGNvbnRyb2wgcG9pbnRzIGNhbiBiZSBtb3ZlZCBieSBhcnJvd3NcbiAgICAgIG1vdmVTZWxlY3RlZEFuY2hvcnNPbktleUV2ZW50czogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0sXG4gICAgICAvLyB3aGV0aGVyICdSZW1vdmUgYWxsIGJlbmQgcG9pbnRzJyBhbmQgJ1JlbW92ZSBhbGwgY29udHJvbCBwb2ludHMnIG9wdGlvbnMgc2hvdWxkIGJlIHByZXNlbnRlZFxuICAgICAgZW5hYmxlTXVsdGlwbGVBbmNob3JSZW1vdmFsT3B0aW9uOiBmYWxzZSxcbiAgICAgIC8vIHNwZWNpZmljYWxseSBmb3IgZWRnZS1lZGl0aW5nIG1lbnUgaXRlbXMsIHdoZXRoZXIgdHJhaWxpbmcgZGl2aWRlcnMgc2hvdWxkIGJlIHVzZWRcbiAgICAgIHVzZVRyYWlsaW5nRGl2aWRlcnNBZnRlckNvbnRleHRNZW51T3B0aW9uczogZmFsc2UsXG4gICAgICAvLyBFbmFibGUgLyBkaXNhYmxlIGRyYWcgY3JlYXRpb24gb2YgYW5jaG9yIHBvaW50cyB3aGVuIHRoZXJlIGlzIGF0IGxlYXN0IG9uZSBhbmNob3IgYWxyZWFkeSBvbiB0aGUgZWRnZVxuICAgICAgZW5hYmxlQ3JlYXRlQW5jaG9yT25EcmFnOiB0cnVlXG4gICAgfTtcblxuICAgIHZhciBvcHRpb25zO1xuICAgIHZhciBpbml0aWFsaXplZCA9IGZhbHNlO1xuXG4gICAgLy8gTWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgY29taW5nIGZyb20gcGFyYW1ldGVyXG4gICAgZnVuY3Rpb24gZXh0ZW5kKGRlZmF1bHRzLCBvcHRpb25zKSB7XG4gICAgICB2YXIgb2JqID0ge307XG5cbiAgICAgIGZvciAodmFyIGkgaW4gZGVmYXVsdHMpIHtcbiAgICAgICAgb2JqW2ldID0gZGVmYXVsdHNbaV07XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xuICAgICAgICAvLyBTUExJVCBGVU5DVElPTkFMSVRZP1xuICAgICAgICBpZiAoaSA9PSBcImJlbmRSZW1vdmFsU2Vuc2l0aXZpdHlcIikge1xuICAgICAgICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNbaV07XG4gICAgICAgICAgaWYgKCFpc05hTih2YWx1ZSkpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA+PSAwICYmIHZhbHVlIDw9IDIwKSB7XG4gICAgICAgICAgICAgIG9ialtpXSA9IG9wdGlvbnNbaV07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlIDwgMCkge1xuICAgICAgICAgICAgICBvYmpbaV0gPSAwXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBvYmpbaV0gPSAyMFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBvYmpbaV0gPSBvcHRpb25zW2ldO1xuICAgICAgICB9XG5cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuXG4gICAgY3l0b3NjYXBlKCdjb3JlJywgJ2VkZ2VFZGl0aW5nJywgZnVuY3Rpb24gKG9wdHMpIHtcbiAgICAgIHZhciBjeSA9IHRoaXM7XG5cbiAgICAgIGlmIChvcHRzID09PSAnaW5pdGlhbGl6ZWQnKSB7XG4gICAgICAgIHJldHVybiBpbml0aWFsaXplZDtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdHMgIT09ICdnZXQnKSB7XG4gICAgICAgIC8vIG1lcmdlIHRoZSBvcHRpb25zIHdpdGggZGVmYXVsdCBvbmVzXG4gICAgICAgIG9wdGlvbnMgPSBleHRlbmQoZGVmYXVsdHMsIG9wdHMpO1xuICAgICAgICBpbml0aWFsaXplZCA9IHRydWU7XG5cbiAgICAgICAgLy8gZGVmaW5lIGVkZ2ViZW5kZWRpdGluZy1oYXNiZW5kcG9pbnRzIGNzcyBjbGFzc1xuICAgICAgICBjeS5zdHlsZSgpLnNlbGVjdG9yKCcuZWRnZWJlbmRlZGl0aW5nLWhhc2JlbmRwb2ludHMnKS5jc3Moe1xuICAgICAgICAgICdjdXJ2ZS1zdHlsZSc6ICdzZWdtZW50cycsXG4gICAgICAgICAgJ3NlZ21lbnQtZGlzdGFuY2VzJzogZnVuY3Rpb24gKGVsZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldERpc3RhbmNlc1N0cmluZyhlbGUsICdiZW5kJyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICAnc2VnbWVudC13ZWlnaHRzJzogZnVuY3Rpb24gKGVsZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldFdlaWdodHNTdHJpbmcoZWxlLCAnYmVuZCcpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgJ2VkZ2UtZGlzdGFuY2VzJzogJ25vZGUtcG9zaXRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGRlZmluZSBlZGdlY29udHJvbGVkaXRpbmctaGFzY29udHJvbHBvaW50cyBjc3MgY2xhc3NcbiAgICAgICAgY3kuc3R5bGUoKS5zZWxlY3RvcignLmVkZ2Vjb250cm9sZWRpdGluZy1oYXNjb250cm9scG9pbnRzJykuY3NzKHtcbiAgICAgICAgICAnY3VydmUtc3R5bGUnOiAndW5idW5kbGVkLWJlemllcicsXG4gICAgICAgICAgJ2NvbnRyb2wtcG9pbnQtZGlzdGFuY2VzJzogZnVuY3Rpb24gKGVsZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldERpc3RhbmNlc1N0cmluZyhlbGUsICdjb250cm9sJyk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICAnY29udHJvbC1wb2ludC13ZWlnaHRzJzogZnVuY3Rpb24gKGVsZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldFdlaWdodHNTdHJpbmcoZWxlLCAnY29udHJvbCcpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgJ2VkZ2UtZGlzdGFuY2VzJzogJ25vZGUtcG9zaXRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGN5LnN0eWxlKCkuc2VsZWN0b3IoXCIjbnd0X3JlY29ubmVjdEVkZ2VfZHVtbXlcIikuY3NzKHtcbiAgICAgICAgICAnd2lkdGgnOiAnMScsXG4gICAgICAgICAgJ2hlaWdodCc6ICcxJyxcbiAgICAgICAgICAndmlzaWJpbGl0eSc6ICdoaWRkZW4nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGFuY2hvclBvaW50VXRpbGl0aWVzLnNldElnbm9yZWRDbGFzc2VzKG9wdGlvbnMuaWdub3JlZENsYXNzZXMpO1xuXG4gICAgICAgIC8vIGluaXQgYmVuZCBwb3NpdGlvbnMgY29uZGl0aW9uYWxseVxuICAgICAgICBpZiAob3B0aW9ucy5pbml0QW5jaG9yc0F1dG9tYXRpY2FsbHkpIHtcbiAgICAgICAgICAvLyBDSEVDSyBUSElTLCBvcHRpb25zLmlnbm9yZWRDbGFzc2VzIFVOVVNFRFxuICAgICAgICAgIGFuY2hvclBvaW50VXRpbGl0aWVzLmluaXRBbmNob3JQb2ludHMob3B0aW9ucy5iZW5kUG9zaXRpb25zRnVuY3Rpb24sIG9wdGlvbnMuY29udHJvbFBvc2l0aW9uc0Z1bmN0aW9uLCBjeS5lZGdlcygpLCBvcHRpb25zLmlnbm9yZWRDbGFzc2VzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVpVXRpbGl0aWVzKG9wdGlvbnMsIGN5KTtcbiAgICAgIH1cblxuICAgICAgdmFyIGluc3RhbmNlID0gaW5pdGlhbGl6ZWQgPyB7XG4gICAgICAgIC8qXG4gICAgICAgICogZ2V0IGJlbmQgb3IgY29udHJvbCBwb2ludHMgb2YgdGhlIGdpdmVuIGVkZ2UgaW4gYW4gYXJyYXkgQSxcbiAgICAgICAgKiBBWzIgKiBpXSBpcyB0aGUgeCBjb29yZGluYXRlIGFuZCBBWzIgKiBpICsgMV0gaXMgdGhlIHkgY29vcmRpbmF0ZVxuICAgICAgICAqIG9mIHRoZSBpdGggYmVuZCBwb2ludC4gKFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZSBjdXJ2ZSBzdHlsZSBpcyBub3Qgc2VnbWVudHMgbm9yIHVuYnVuZGxlZCBiZXppZXIpXG4gICAgICAgICovXG4gICAgICAgIGdldEFuY2hvcnNBc0FycmF5OiBmdW5jdGlvbiAoZWxlKSB7XG4gICAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEFuY2hvcnNBc0FycmF5KGVsZSk7XG4gICAgICAgIH0sXG4gICAgICAgIC8vIEluaXRpbGl6ZSBwb2ludHMgZm9yIHRoZSBnaXZlbiBlZGdlcyB1c2luZyAnb3B0aW9ucy5iZW5kUG9zaXRpb25zRnVuY3Rpb24nXG4gICAgICAgIGluaXRBbmNob3JQb2ludHM6IGZ1bmN0aW9uIChlbGVzKSB7XG4gICAgICAgICAgYW5jaG9yUG9pbnRVdGlsaXRpZXMuaW5pdEFuY2hvclBvaW50cyhvcHRpb25zLmJlbmRQb3NpdGlvbnNGdW5jdGlvbiwgb3B0aW9ucy5jb250cm9sUG9zaXRpb25zRnVuY3Rpb24sIGVsZXMpO1xuICAgICAgICB9LFxuICAgICAgICBkZWxldGVTZWxlY3RlZEFuY2hvcjogZnVuY3Rpb24gKGVsZSwgaW5kZXgpIHtcbiAgICAgICAgICBhbmNob3JQb2ludFV0aWxpdGllcy5yZW1vdmVBbmNob3IoZWxlLCBpbmRleCk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldEVkZ2VUeXBlOiBmdW5jdGlvbiAoZWxlKSB7XG4gICAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldEVkZ2VUeXBlKGVsZSk7XG4gICAgICAgIH1cbiAgICAgIH0gOiB1bmRlZmluZWQ7XG5cbiAgICAgIHJldHVybiBpbnN0YW5jZTsgLy8gY2hhaW5hYmlsaXR5XG4gICAgfSk7XG4gIH07XG5cbiAgY3l0b3NjYXBlKCdjb3JlJywgJ2VkZ2VFZGl0aW5nUmVmcmVzaCcsIGZ1bmN0aW9uIChvcHRzKSB7XG4gICAgdmFyIGN5ID0gdGhpcztcblxuXG5cblxuXG4gICAgLy8gZGVmaW5lIGVkZ2ViZW5kZWRpdGluZy1oYXNiZW5kcG9pbnRzIGNzcyBjbGFzc1xuICAgIGN5LnN0eWxlKCkuc2VsZWN0b3IoJy5lZGdlYmVuZGVkaXRpbmctaGFzYmVuZHBvaW50cycpLmNzcyh7XG4gICAgICAnY3VydmUtc3R5bGUnOiAnc2VnbWVudHMnLFxuICAgICAgJ3NlZ21lbnQtZGlzdGFuY2VzJzogZnVuY3Rpb24gKGVsZSkge1xuICAgICAgICByZXR1cm4gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0RGlzdGFuY2VzU3RyaW5nKGVsZSwgJ2JlbmQnKTtcbiAgICAgIH0sXG4gICAgICAnc2VnbWVudC13ZWlnaHRzJzogZnVuY3Rpb24gKGVsZSkge1xuICAgICAgICByZXR1cm4gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0V2VpZ2h0c1N0cmluZyhlbGUsICdiZW5kJyk7XG4gICAgICB9LFxuICAgICAgJ2VkZ2UtZGlzdGFuY2VzJzogJ25vZGUtcG9zaXRpb24nXG4gICAgfSk7XG5cbiAgICAvLyBkZWZpbmUgZWRnZWNvbnRyb2xlZGl0aW5nLWhhc2NvbnRyb2xwb2ludHMgY3NzIGNsYXNzXG4gICAgY3kuc3R5bGUoKS5zZWxlY3RvcignLmVkZ2Vjb250cm9sZWRpdGluZy1oYXNjb250cm9scG9pbnRzJykuY3NzKHtcbiAgICAgICdjdXJ2ZS1zdHlsZSc6ICd1bmJ1bmRsZWQtYmV6aWVyJyxcbiAgICAgICdjb250cm9sLXBvaW50LWRpc3RhbmNlcyc6IGZ1bmN0aW9uIChlbGUpIHtcbiAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldERpc3RhbmNlc1N0cmluZyhlbGUsICdjb250cm9sJyk7XG4gICAgICB9LFxuICAgICAgJ2NvbnRyb2wtcG9pbnQtd2VpZ2h0cyc6IGZ1bmN0aW9uIChlbGUpIHtcbiAgICAgICAgcmV0dXJuIGFuY2hvclBvaW50VXRpbGl0aWVzLmdldFdlaWdodHNTdHJpbmcoZWxlLCAnY29udHJvbCcpO1xuICAgICAgfSxcbiAgICAgICdlZGdlLWRpc3RhbmNlcyc6ICdub2RlLXBvc2l0aW9uJ1xuICAgIH0pO1xuXG4gICAgY3kuc3R5bGUoKS5zZWxlY3RvcihcIiNud3RfcmVjb25uZWN0RWRnZV9kdW1teVwiKS5jc3Moe1xuICAgICAgJ3dpZHRoJzogJzEnLFxuICAgICAgJ2hlaWdodCc6ICcxJyxcbiAgICAgICd2aXNpYmlsaXR5JzogJ2hpZGRlbidcbiAgICB9KTtcblxuXG4gICAgcmV0dXJuIGluc3RhbmNlOyAvLyBjaGFpbmFiaWxpdHlcbiAgfSk7XG5cblxuXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykgeyAvLyBleHBvc2UgYXMgYSBjb21tb25qcyBtb2R1bGVcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHJlZ2lzdGVyO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBkZWZpbmUgIT09ICd1bmRlZmluZWQnICYmIGRlZmluZS5hbWQpIHsgLy8gZXhwb3NlIGFzIGFuIGFtZC9yZXF1aXJlanMgbW9kdWxlXG4gICAgZGVmaW5lKCdjeXRvc2NhcGUtZWRnZS1lZGl0aW5nJywgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHJlZ2lzdGVyO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBjeXRvc2NhcGUgIT09ICd1bmRlZmluZWQnICYmICQgJiYgS29udmEpIHsgLy8gZXhwb3NlIHRvIGdsb2JhbCBjeXRvc2NhcGUgKGkuZS4gd2luZG93LmN5dG9zY2FwZSlcbiAgICByZWdpc3RlcihjeXRvc2NhcGUsICQsIEtvbnZhKTtcbiAgfVxuXG59KSgpO1xuIiwidmFyIHJlY29ubmVjdGlvblV0aWxpdGllcyA9IHtcblxuICAgIC8vIGNyZWF0ZXMgYW5kIHJldHVybnMgYSBkdW1teSBub2RlIHdoaWNoIGlzIGNvbm5lY3RlZCB0byB0aGUgZGlzY29ubmVjdGVkIGVkZ2VcbiAgICBkaXNjb25uZWN0RWRnZTogZnVuY3Rpb24gKGVkZ2UsIGN5LCBwb3NpdGlvbiwgZGlzY29ubmVjdGVkRW5kKSB7XG4gICAgICAgIFxuICAgICAgICB2YXIgZHVtbXlOb2RlID0ge1xuICAgICAgICAgICAgZGF0YTogeyBcbiAgICAgICAgICAgICAgaWQ6ICdud3RfcmVjb25uZWN0RWRnZV9kdW1teScsXG4gICAgICAgICAgICAgIHBvcnRzOiBbXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICByZW5kZXJlZFBvc2l0aW9uOiBwb3NpdGlvblxuICAgICAgICB9O1xuICAgICAgICBjeS5hZGQoZHVtbXlOb2RlKTtcblxuICAgICAgICB2YXIgbG9jID0gKGRpc2Nvbm5lY3RlZEVuZCA9PT0gJ3NvdXJjZScpID8gXG4gICAgICAgICAgICB7c291cmNlOiBkdW1teU5vZGUuZGF0YS5pZH0gOiBcbiAgICAgICAgICAgIHt0YXJnZXQ6IGR1bW15Tm9kZS5kYXRhLmlkfTtcblxuICAgICAgICBlZGdlID0gZWRnZS5tb3ZlKGxvYylbMF07XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGR1bW15Tm9kZTogY3kubm9kZXMoXCIjXCIgKyBkdW1teU5vZGUuZGF0YS5pZClbMF0sXG4gICAgICAgICAgICBlZGdlOiBlZGdlXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIGNvbm5lY3RFZGdlOiBmdW5jdGlvbiAoZWRnZSwgbm9kZSwgbG9jYXRpb24pIHtcbiAgICAgICAgaWYoIWVkZ2UuaXNFZGdlKCkgfHwgIW5vZGUuaXNOb2RlKCkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIGxvYyA9IHt9O1xuICAgICAgICBpZihsb2NhdGlvbiA9PT0gJ3NvdXJjZScpXG4gICAgICAgICAgICBsb2Muc291cmNlID0gbm9kZS5pZCgpO1xuICAgICAgICBcbiAgICAgICAgZWxzZSBpZihsb2NhdGlvbiA9PT0gJ3RhcmdldCcpXG4gICAgICAgICAgICBsb2MudGFyZ2V0ID0gbm9kZS5pZCgpO1xuICAgICAgICBcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHJldHVybiBlZGdlLm1vdmUobG9jKVswXTtcbiAgICB9LFxuXG4gICAgY29weUVkZ2U6IGZ1bmN0aW9uIChvbGRFZGdlLCBuZXdFZGdlKSB7XG4gICAgICAgIHRoaXMuY29weUFuY2hvcnMob2xkRWRnZSwgbmV3RWRnZSk7XG4gICAgICAgIHRoaXMuY29weVN0eWxlKG9sZEVkZ2UsIG5ld0VkZ2UpO1xuICAgIH0sXG5cbiAgICBjb3B5U3R5bGU6IGZ1bmN0aW9uIChvbGRFZGdlLCBuZXdFZGdlKSB7XG4gICAgICAgIGlmKG9sZEVkZ2UgJiYgbmV3RWRnZSl7XG4gICAgICAgICAgICBuZXdFZGdlLmRhdGEoJ2xpbmUtY29sb3InLCBvbGRFZGdlLmRhdGEoJ2xpbmUtY29sb3InKSk7XG4gICAgICAgICAgICBuZXdFZGdlLmRhdGEoJ3dpZHRoJywgb2xkRWRnZS5kYXRhKCd3aWR0aCcpKTtcbiAgICAgICAgICAgIG5ld0VkZ2UuZGF0YSgnY2FyZGluYWxpdHknLCBvbGRFZGdlLmRhdGEoJ2NhcmRpbmFsaXR5JykpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGNvcHlBbmNob3JzOiBmdW5jdGlvbiAob2xkRWRnZSwgbmV3RWRnZSkge1xuICAgICAgICBpZihvbGRFZGdlLmhhc0NsYXNzKCdlZGdlYmVuZGVkaXRpbmctaGFzYmVuZHBvaW50cycpKXtcbiAgICAgICAgICAgIHZhciBicERpc3RhbmNlcyA9IG9sZEVkZ2UuZGF0YSgnY3llZGdlYmVuZGVkaXRpbmdEaXN0YW5jZXMnKTtcbiAgICAgICAgICAgIHZhciBicFdlaWdodHMgPSBvbGRFZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nV2VpZ2h0cycpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBuZXdFZGdlLmRhdGEoJ2N5ZWRnZWJlbmRlZGl0aW5nRGlzdGFuY2VzJywgYnBEaXN0YW5jZXMpO1xuICAgICAgICAgICAgbmV3RWRnZS5kYXRhKCdjeWVkZ2ViZW5kZWRpdGluZ1dlaWdodHMnLCBicFdlaWdodHMpO1xuICAgICAgICAgICAgbmV3RWRnZS5hZGRDbGFzcygnZWRnZWJlbmRlZGl0aW5nLWhhc2JlbmRwb2ludHMnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmKG9sZEVkZ2UuaGFzQ2xhc3MoJ2VkZ2Vjb250cm9sZWRpdGluZy1oYXNjb250cm9scG9pbnRzJykpe1xuICAgICAgICAgICAgdmFyIGJwRGlzdGFuY2VzID0gb2xkRWRnZS5kYXRhKCdjeWVkZ2Vjb250cm9sZWRpdGluZ0Rpc3RhbmNlcycpO1xuICAgICAgICAgICAgdmFyIGJwV2VpZ2h0cyA9IG9sZEVkZ2UuZGF0YSgnY3llZGdlY29udHJvbGVkaXRpbmdXZWlnaHRzJyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIG5ld0VkZ2UuZGF0YSgnY3llZGdlY29udHJvbGVkaXRpbmdEaXN0YW5jZXMnLCBicERpc3RhbmNlcyk7XG4gICAgICAgICAgICBuZXdFZGdlLmRhdGEoJ2N5ZWRnZWNvbnRyb2xlZGl0aW5nV2VpZ2h0cycsIGJwV2VpZ2h0cyk7XG4gICAgICAgICAgICBuZXdFZGdlLmFkZENsYXNzKCdlZGdlY29udHJvbGVkaXRpbmctaGFzY29udHJvbHBvaW50cycpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvbGRFZGdlLmhhc0NsYXNzKCdlZGdlYmVuZGVkaXRpbmctaGFzbXVsdGlwbGViZW5kcG9pbnRzJykpIHtcbiAgICAgICAgICAgIG5ld0VkZ2UuYWRkQ2xhc3MoJ2VkZ2ViZW5kZWRpdGluZy1oYXNtdWx0aXBsZWJlbmRwb2ludHMnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvbGRFZGdlLmhhc0NsYXNzKCdlZGdlY29udHJvbGVkaXRpbmctaGFzbXVsdGlwbGVjb250cm9scG9pbnRzJykpIHtcbiAgICAgICAgICAgIG5ld0VkZ2UuYWRkQ2xhc3MoJ2VkZ2Vjb250cm9sZWRpdGluZy1oYXNtdWx0aXBsZWNvbnRyb2xwb2ludHMnKTtcbiAgICAgICAgfVxuICAgIH0sXG59O1xuICBcbm1vZHVsZS5leHBvcnRzID0gcmVjb25uZWN0aW9uVXRpbGl0aWVzO1xuICAiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjeSwgYW5jaG9yUG9pbnRVdGlsaXRpZXMsIHBhcmFtcykge1xuICBpZiAoY3kudW5kb1JlZG8gPT0gbnVsbClcbiAgICByZXR1cm47XG5cbiAgdmFyIHVyID0gY3kudW5kb1JlZG8oe1xuICAgIGRlZmF1bHRBY3Rpb25zOiBmYWxzZSxcbiAgICBpc0RlYnVnOiB0cnVlXG4gIH0pO1xuXG4gIGZ1bmN0aW9uIGNoYW5nZUFuY2hvclBvaW50cyhwYXJhbSkge1xuICAgIHZhciBlZGdlID0gY3kuZ2V0RWxlbWVudEJ5SWQocGFyYW0uZWRnZS5pZCgpKTtcbiAgICB2YXIgdHlwZSA9IHBhcmFtLnR5cGUgIT09ICdub25lJyA/IHBhcmFtLnR5cGUgOiBhbmNob3JQb2ludFV0aWxpdGllcy5nZXRFZGdlVHlwZShlZGdlKTtcbiAgICBcbiAgICB2YXIgd2VpZ2h0cywgZGlzdGFuY2VzLCB3ZWlnaHRTdHIsIGRpc3RhbmNlU3RyO1xuXG4gICAgaWYocGFyYW0udHlwZSA9PT0gJ25vbmUnICYmICFwYXJhbS5zZXQpe1xuICAgICAgd2VpZ2h0cyA9IFtdO1xuICAgICAgZGlzdGFuY2VzID0gW107XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgd2VpZ2h0U3RyID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuc3ludGF4W3R5cGVdWyd3ZWlnaHQnXTtcbiAgICAgIGRpc3RhbmNlU3RyID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuc3ludGF4W3R5cGVdWydkaXN0YW5jZSddO1xuXG4gICAgICB3ZWlnaHRzID0gcGFyYW0uc2V0ID8gZWRnZS5kYXRhKHdlaWdodFN0cikgOiBwYXJhbS53ZWlnaHRzO1xuICAgICAgZGlzdGFuY2VzID0gcGFyYW0uc2V0ID8gZWRnZS5kYXRhKGRpc3RhbmNlU3RyKSA6IHBhcmFtLmRpc3RhbmNlcztcbiAgICB9XG5cbiAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgZWRnZTogZWRnZSxcbiAgICAgIHR5cGU6IHR5cGUsXG4gICAgICB3ZWlnaHRzOiB3ZWlnaHRzLFxuICAgICAgZGlzdGFuY2VzOiBkaXN0YW5jZXMsXG4gICAgICAvL0FzIHRoZSByZXN1bHQgd2lsbCBub3QgYmUgdXNlZCBmb3IgdGhlIGZpcnN0IGZ1bmN0aW9uIGNhbGwgcGFyYW1zIHNob3VsZCBiZSB1c2VkIHRvIHNldCB0aGUgZGF0YVxuICAgICAgc2V0OiB0cnVlXG4gICAgfTtcblxuICAgIC8vQ2hlY2sgaWYgd2UgbmVlZCB0byBzZXQgdGhlIHdlaWdodHMgYW5kIGRpc3RhbmNlcyBieSB0aGUgcGFyYW0gdmFsdWVzXG4gICAgaWYgKHBhcmFtLnNldCkge1xuXG4gICAgICB2YXIgaGFkQW5jaG9yUG9pbnQgPSBwYXJhbS53ZWlnaHRzICYmIHBhcmFtLndlaWdodHMubGVuZ3RoID4gMDtcbiAgICAgIHZhciBoYWRNdWx0aXBsZUFuY2hvclBvaW50cyA9IGhhZEFuY2hvclBvaW50ICYmIHBhcmFtLndlaWdodHMubGVuZ3RoID4gMTtcblxuICAgICAgaWYgKGhhZEFuY2hvclBvaW50KSB7XG4gICAgICAgIGVkZ2UuZGF0YSh3ZWlnaHRTdHIsIHBhcmFtLndlaWdodHMpO1xuICAgICAgICBlZGdlLmRhdGEoZGlzdGFuY2VTdHIsIHBhcmFtLmRpc3RhbmNlcylcbiAgICAgIH1cblxuICAgICAgdmFyIHNpbmdsZUNsYXNzTmFtZSA9IGFuY2hvclBvaW50VXRpbGl0aWVzLnN5bnRheFt0eXBlXVsnY2xhc3MnXTtcbiAgICAgIHZhciBtdWx0aUNsYXNzTmFtZSA9IGFuY2hvclBvaW50VXRpbGl0aWVzLnN5bnRheFt0eXBlXVsnbXVsdGlDbGFzcyddO1xuXG4gICAgICAvLyBSZWZyZXNoIHRoZSBjdXJ2ZSBzdHlsZSBhcyB0aGUgbnVtYmVyIG9mIGFuY2hvciBwb2ludCB3b3VsZCBiZSBjaGFuZ2VkIGJ5IHRoZSBwcmV2aW91cyBvcGVyYXRpb25cbiAgICAgIC8vIEFkZGluZyBvciByZW1vdmluZyBtdWx0aSBjbGFzc2VzIGF0IG9uY2UgY2FuIGNhdXNlIGVycm9ycy4gSWYgbXVsdGlwbGUgY2xhc3NlcyBhcmUgdG8gYmUgYWRkZWQsXG4gICAgICAvLyBqdXN0IGFkZCB0aGVtIHRvZ2V0aGVyIGluIHNwYWNlIGRlbGltZXRlZCBjbGFzcyBuYW1lcyBmb3JtYXQuXG4gICAgICBpZiAoIWhhZEFuY2hvclBvaW50ICYmICFoYWRNdWx0aXBsZUFuY2hvclBvaW50cykge1xuICAgICAgICAvLyBSZW1vdmUgbXVsdGlwbGUgY2xhc3NlcyBmcm9tIGVkZ2Ugd2l0aCBzcGFjZSBkZWxpbWV0ZWQgc3RyaW5nIG9mIGNsYXNzIG5hbWVzIFxuICAgICAgICBlZGdlLnJlbW92ZUNsYXNzKHNpbmdsZUNsYXNzTmFtZSArIFwiIFwiICsgbXVsdGlDbGFzc05hbWUpO1xuICAgICAgfVxuICAgICAgZWxzZSBpZiAoaGFkQW5jaG9yUG9pbnQgJiYgIWhhZE11bHRpcGxlQW5jaG9yUG9pbnRzKSB7IC8vIEhhZCBzaW5nbGUgYW5jaG9yXG4gICAgICAgIGVkZ2UuYWRkQ2xhc3Moc2luZ2xlQ2xhc3NOYW1lKTtcbiAgICAgICAgZWRnZS5yZW1vdmVDbGFzcyhtdWx0aUNsYXNzTmFtZSk7ICAgXG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgLy8gSGFkIG11bHRpcGxlIGFuY2hvcnMuIEFkZCBtdWx0aXBsZSBjbGFzc2VzIHdpdGggc3BhY2UgZGVsaW1ldGVkIHN0cmluZyBvZiBjbGFzcyBuYW1lc1xuICAgICAgICBlZGdlLmFkZENsYXNzKHNpbmdsZUNsYXNzTmFtZSArIFwiIFwiICsgbXVsdGlDbGFzc05hbWUpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWhhZEFuY2hvclBvaW50KSB7XG4gICAgICAgIGVkZ2UuZGF0YSh3ZWlnaHRTdHIsIFtdKTtcbiAgICAgICAgZWRnZS5kYXRhKGRpc3RhbmNlU3RyLCBbXSk7XG4gICAgICB9XG5cbiAgICAgIGlmICghZWRnZS5zZWxlY3RlZCgpKVxuICAgICAgICBlZGdlLnNlbGVjdCgpO1xuICAgICAgZWxzZSB7XG4gICAgICAgIGVkZ2UudW5zZWxlY3QoKTtcbiAgICAgICAgZWRnZS5zZWxlY3QoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgZWRnZS50cmlnZ2VyKCdjeWVkZ2VlZGl0aW5nLmNoYW5nZUFuY2hvclBvaW50cycpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1vdmVEbyhhcmcpIHtcbiAgICAgIGlmIChhcmcuZmlyc3RUaW1lKSB7XG4gICAgICAgICAgZGVsZXRlIGFyZy5maXJzdFRpbWU7XG4gICAgICAgICAgcmV0dXJuIGFyZztcbiAgICAgIH1cblxuICAgICAgdmFyIGVkZ2VzID0gYXJnLmVkZ2VzO1xuICAgICAgdmFyIHBvc2l0aW9uRGlmZiA9IGFyZy5wb3NpdGlvbkRpZmY7XG4gICAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgICAgIGVkZ2VzOiBlZGdlcyxcbiAgICAgICAgICBwb3NpdGlvbkRpZmY6IHtcbiAgICAgICAgICAgICAgeDogLXBvc2l0aW9uRGlmZi54LFxuICAgICAgICAgICAgICB5OiAtcG9zaXRpb25EaWZmLnlcbiAgICAgICAgICB9XG4gICAgICB9O1xuICAgICAgbW92ZUFuY2hvcnNVbmRvYWJsZShwb3NpdGlvbkRpZmYsIGVkZ2VzKTtcblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1vdmVBbmNob3JzVW5kb2FibGUocG9zaXRpb25EaWZmLCBlZGdlcykge1xuICAgICAgZWRnZXMuZm9yRWFjaChmdW5jdGlvbiggZWRnZSApe1xuICAgICAgICAgIHZhciB0eXBlID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0RWRnZVR5cGUoZWRnZSk7XG4gICAgICAgICAgdmFyIHByZXZpb3VzQW5jaG9yc1Bvc2l0aW9uID0gYW5jaG9yUG9pbnRVdGlsaXRpZXMuZ2V0QW5jaG9yc0FzQXJyYXkoZWRnZSk7XG4gICAgICAgICAgdmFyIG5leHRBbmNob3JzUG9zaXRpb24gPSBbXTtcbiAgICAgICAgICBpZiAocHJldmlvdXNBbmNob3JzUG9zaXRpb24gIT0gdW5kZWZpbmVkKVxuICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPHByZXZpb3VzQW5jaG9yc1Bvc2l0aW9uLmxlbmd0aDsgaSs9MilcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgbmV4dEFuY2hvcnNQb3NpdGlvbi5wdXNoKHt4OiBwcmV2aW91c0FuY2hvcnNQb3NpdGlvbltpXStwb3NpdGlvbkRpZmYueCwgeTogcHJldmlvdXNBbmNob3JzUG9zaXRpb25baSsxXStwb3NpdGlvbkRpZmYueX0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICh0eXBlID09PSAnYmVuZCcpIHtcbiAgICAgICAgICAgICAgICBwYXJhbXMuYmVuZFBvaW50UG9zaXRpb25zU2V0dGVyRnVuY3Rpb24oZWRnZSwgbmV4dEFuY2hvcnNQb3NpdGlvbik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgZWxzZSBpZiAodHlwZSA9PT0gJ2NvbnRyb2wnKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zLmNvbnRyb2xQb2ludFBvc2l0aW9uc1NldHRlckZ1bmN0aW9uKGVkZ2UsIG5leHRBbmNob3JzUG9zaXRpb24pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGFuY2hvclBvaW50VXRpbGl0aWVzLmluaXRBbmNob3JQb2ludHMocGFyYW1zLmJlbmRQb3NpdGlvbnNGdW5jdGlvbiwgcGFyYW1zLmNvbnRyb2xQb3NpdGlvbnNGdW5jdGlvbiwgZWRnZXMpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVjb25uZWN0RWRnZShwYXJhbSl7XG4gICAgdmFyIGVkZ2UgICAgICA9IHBhcmFtLmVkZ2U7XG4gICAgdmFyIGxvY2F0aW9uICA9IHBhcmFtLmxvY2F0aW9uO1xuICAgIHZhciBvbGRMb2MgICAgPSBwYXJhbS5vbGRMb2M7XG5cbiAgICBlZGdlID0gZWRnZS5tb3ZlKGxvY2F0aW9uKVswXTtcblxuICAgIHZhciByZXN1bHQgPSB7XG4gICAgICBlZGdlOiAgICAgZWRnZSxcbiAgICAgIGxvY2F0aW9uOiBvbGRMb2MsXG4gICAgICBvbGRMb2M6ICAgbG9jYXRpb25cbiAgICB9XG4gICAgZWRnZS51bnNlbGVjdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVSZWNvbm5lY3RlZEVkZ2UocGFyYW0pe1xuICAgIHZhciBvbGRFZGdlID0gcGFyYW0ub2xkRWRnZTtcbiAgICB2YXIgdG1wID0gY3kuZ2V0RWxlbWVudEJ5SWQob2xkRWRnZS5kYXRhKCdpZCcpKTtcbiAgICBpZih0bXAgJiYgdG1wLmxlbmd0aCA+IDApXG4gICAgICBvbGRFZGdlID0gdG1wO1xuXG4gICAgdmFyIG5ld0VkZ2UgPSBwYXJhbS5uZXdFZGdlO1xuICAgIHZhciB0bXAgPSBjeS5nZXRFbGVtZW50QnlJZChuZXdFZGdlLmRhdGEoJ2lkJykpO1xuICAgIGlmKHRtcCAmJiB0bXAubGVuZ3RoID4gMClcbiAgICAgIG5ld0VkZ2UgPSB0bXA7XG5cbiAgICBpZihvbGRFZGdlLmluc2lkZSgpKXtcbiAgICAgIG9sZEVkZ2UgPSBvbGRFZGdlLnJlbW92ZSgpWzBdO1xuICAgIH0gXG4gICAgICBcbiAgICBpZihuZXdFZGdlLnJlbW92ZWQoKSl7XG4gICAgICBuZXdFZGdlID0gbmV3RWRnZS5yZXN0b3JlKCk7XG4gICAgICBuZXdFZGdlLnVuc2VsZWN0KCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBvbGRFZGdlOiBuZXdFZGdlLFxuICAgICAgbmV3RWRnZTogb2xkRWRnZVxuICAgIH07XG4gIH1cblxuICB1ci5hY3Rpb24oJ2NoYW5nZUFuY2hvclBvaW50cycsIGNoYW5nZUFuY2hvclBvaW50cywgY2hhbmdlQW5jaG9yUG9pbnRzKTtcbiAgdXIuYWN0aW9uKCdtb3ZlQW5jaG9yUG9pbnRzJywgbW92ZURvLCBtb3ZlRG8pO1xuICB1ci5hY3Rpb24oJ3JlY29ubmVjdEVkZ2UnLCByZWNvbm5lY3RFZGdlLCByZWNvbm5lY3RFZGdlKTtcbiAgdXIuYWN0aW9uKCdyZW1vdmVSZWNvbm5lY3RlZEVkZ2UnLCByZW1vdmVSZWNvbm5lY3RlZEVkZ2UsIHJlbW92ZVJlY29ubmVjdGVkRWRnZSk7XG59O1xuIiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyg1NzkpO1xuIl0sInNvdXJjZVJvb3QiOiIifQ==