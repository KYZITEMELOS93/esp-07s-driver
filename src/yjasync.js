/**
 * @fileOverview
 * @name YjAsync.js
 * @author Yang Jun <yangjun@nanchao.org>
 * @license MIT license
 * 
 * This is a brief version of Async
 * 
 */
'use strict';

module.exports = (function () {


	/**
	 * series implementation
	 *
	 * @param {} arr, function Array
	 * @param {} cb, callback function
	 */
	function series(arr, cb) {
		var mIndex = 0;
		var lstResult = [];

		function funcCallback(err, data) {
			if (err) {
				cb(err, lstResult);
				return;
			} else {
				lstResult.push(data);
			}

			mIndex++;

			if (mIndex < arr.length) {
				arr[mIndex](funcCallback);
			} else {
				cb(null, lstResult);
			}
		}

		if (arr.constructor !== Array || arr.length === 0) {
			throw new Error('Not an array');
		}

		arr.forEach(function (e) {
			if (typeof e !== 'function')
				throw new Error('Not a function');
		});

		arr[0](funcCallback);

	}


	function promise() {
		this._curFunc = null;
		this._err = null;
		this._data = null;
		//this._bFinished = false;

		this._queueThen = [];
	}

	promise.prototype.getFunc = function (index) {
		var f = this._queueThen.shift();

		if (f) {
			return f[index];
		} else {
			return null;
		}
	};


	promise.prototype.when = function (func) {
		var that = this;

		if (func === null) {
			return null;
		}

		func(function (err, data) {
			if (err) {
				that.when(that.getFunc(1));
			} else {
				that.when(that.getFunc(0));
			}
		});

		return this;
	};

	promise.prototype.then = function (funcY, funcN) {

		this._queueThen.push([funcY, funcN]);

		return this;
	};

	return {
		version: '0.1',
		series: series,
		promise: promise

	};
})();