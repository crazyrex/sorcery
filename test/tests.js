require( 'source-map-support' ).install();

var path = require( 'path' );
var exec = require( 'child_process' ).exec;
var sander = require( 'sander' );
var assert = require( 'assert' );
var promiseMapSeries = require( 'promise-map-series' );
var SourceMapConsumer = require( 'source-map' ).SourceMapConsumer;
var sorcery = require( '../' );

var Promise = sander.Promise;

process.chdir( __dirname );

describe( 'sorcery', function () {
	this.timeout( 20000 );

	beforeEach( function () {
		return sander.rimraf( '.tmp' );
	});

	afterEach( function () {
		return sander.rimraf( '.tmp' );
	});

	describe( 'sorcery.load()', function () {
		it( 'resolves to null if target has no sourcemap', function () {
			return sorcery.load( 'samples/1/src/helloworld.coffee' ).then( function ( chain ) {
				assert.equal( chain, null );
			});
		});

		it( 'allows user to specify content/sourcemaps', function () {
			return sorcery.load( 'example.js', {
				content: {
					'example.js': '(function() {\
  var answer;\
\
  answer = 40 + 2;\
\
  console.log("the answer is " + answer);\
\
}).call(this);',
					'example.coffee': 'answer = 40 + 2\
console.log "the answer is #{answer}"'
				},
				sourcemaps: {
					'example.js': {
						version: 3,
						sources:[ 'example.coffee' ],
						sourcesContent: [ null ],
						names: [],
						mappings: 'AAAA;AAAA,MAAA,MAAA;;AAAA,EAAA,MAAA,GAAS,EAAA,GAAK,CAAd,CAAA;;AAAA,EACA,OAAO,CAAC,GAAR,CAAa,gBAAA,GAAe,MAA5B,CADA,CAAA;AAAA'
					}
				}
			}).then( function ( chain ) {
				var actual, expected;

				actual = chain.trace( 6, 10 );

				expected = {
					source: path.resolve( 'example.coffee' ),
					line: 2,
					column: 8,
					name: null
				};

				assert.deepEqual( actual, expected );
			})
		});

		it( 'handles URLs that look a bit like data URIs', function () {
			return sorcery.load( 'samples/8/datafile.js' ).then( function ( chain ) {
				var actual = chain.trace( 1, 0 );

				var expected = {
					source: path.resolve( 'samples/8/source.js' ),
					line: 1,
					column: 0,
					name: null
				};

				assert.deepEqual( actual, expected );
			});
		});

		it( 'handles segments of length 1', function () {
			return sorcery.load( 'samples/8/datafile.js' ).then( function ( chain ) {
				// this will throw if 1-length segments are rejected
				var map = chain.apply();
			});
		});
	});

	describe( 'chain.trace()', function () {
		it( 'follows a mapping back to its origin', function () {
			return sorcery.load( 'samples/1/tmp/helloworld.min.js' ).then( function ( chain ) {
				var actual, expected;

				actual = chain.trace( 1, 31 );

				expected = {
					source: path.resolve( 'samples/1/tmp/helloworld.coffee' ),
					line: 2,
					column: 8,
					name: 'log'
				};

				assert.deepEqual( actual, expected );
			});
		});

		it( 'handles browserify-style line mappings', function () {
			return sorcery.load( 'samples/2/tmp/bundle.min.js' ).then( function ( chain ) {
				var actual, expected;

				actual = chain.trace( 1, 487 );

				expected = {
					source: path.resolve( 'samples/2/tmp/a.js' ),
					line: 2,
					column: 0,
					name: 'log'
				};

				assert.deepEqual( actual, expected );
			});
		});

		it( 'uses inline sources if provided', function () {
			return sorcery.load( 'samples/3/tmp/app.esperanto.js' ).then( function ( chain ) {
				var actual = chain.trace( 4, 8 );

				assert.strictEqual( actual.line, 2 );
				assert.strictEqual( actual.column, 8 );
				assert.strictEqual( actual.name, null );
				assert.ok( /app\.js$/.test( actual.source ) );
			});
		});

		it( 'handles CSS sourcemap comments', function () {
			return sorcery.load( 'samples/5/tmp/styles.css' ).then( function ( chain ) {
				var actual, expected;

				actual = chain.trace( 1, 8 );

				expected = {
					source: path.resolve( 'samples/5/tmp/styles.less' ),
					line: 5,
					column: 2,
					name: null
				};

				assert.deepEqual( actual, expected );
			});
		});

		it( 'resolves source paths using sourceRoot where applicable', function () {
			return sorcery.load( 'samples/7/foo.js' ).then( function ( chain ) {
				var actual = chain.trace( 1, 0 );

				var expected = {
					source: path.resolve( 'samples/7/sources/baz.js' ),
					line: 1,
					column: 0,
					name: null
				};

				assert.deepEqual( actual, expected );
			});
		});
	});

	describe( 'chain.apply()', function () {
		it( 'creates a flattened sourcemap', function () {
			return sorcery.load( 'samples/1/tmp/helloworld.min.js' ).then( function ( chain ) {
				var map, smc;

				map = chain.apply();
				smc = new SourceMapConsumer( map );

				assert.equal( map.version, 3 );
				assert.deepEqual( map.file, 'helloworld.min.js' );
				assert.deepEqual( map.sources, [ 'helloworld.coffee' ]);
				assert.deepEqual( map.sourcesContent, [ sander.readFileSync( 'samples/1/src/helloworld.coffee' ).toString() ]);

				var loc = smc.originalPositionFor({ line: 1, column: 31 });
				assert.equal( loc.source, 'helloworld.coffee' );
				assert.equal( loc.line, 2 );
				assert.equal( loc.column, 8 );
				assert.equal( loc.name, 'log' );
			});
		});

		it( 'handles sourceMappingURLs with spaces (#6)', function () {
			return sorcery.load( 'samples/4/tmp/file with spaces.esperanto.js' ).then( function ( chain ) {
				var map, smc;

				map = chain.apply();
				smc = new SourceMapConsumer( map );

				assert.equal( map.version, 3 );
				assert.deepEqual( map.file, 'file with spaces.esperanto.js' );
				assert.deepEqual( map.sources, [ 'file with spaces.js' ]);
				assert.deepEqual( map.sourcesContent, [ sander.readFileSync( 'samples/4/src/file with spaces.js' ).toString() ]);

				var loc = smc.originalPositionFor({ line: 4, column: 8 });
				assert.equal( loc.source, 'file with spaces.js' );
				assert.equal( loc.line, 2 );
				assert.equal( loc.column, 8 );
				assert.equal( loc.name, null );
			});
		});
	});

	describe( 'chain.write()', function () {
		it( 'writes a file and accompanying sourcemap', function () {
			return sorcery.load( 'samples/1/tmp/helloworld.min.js' ).then( function ( chain ) {
				return chain.write( '.tmp/write-file/helloworld.min.js' ).then( function () {
					return sorcery.load( '.tmp/write-file/helloworld.min.js' ).then( function ( chain ) {
						var map, smc;

						map = chain.apply();
						smc = new SourceMapConsumer( map );

						assert.equal( map.version, 3 );
						assert.deepEqual( map.file, 'helloworld.min.js' );
						assert.deepEqual( map.sources, [ '../../samples/1/tmp/helloworld.coffee' ]);
						assert.deepEqual( map.sourcesContent, [ sander.readFileSync( __dirname, 'samples/1/tmp/helloworld.coffee' ).toString() ]);

						var loc = smc.originalPositionFor({ line: 1, column: 31 });
						assert.equal( loc.source, '../../samples/1/tmp/helloworld.coffee' );
						assert.equal( loc.line, 2 );
						assert.equal( loc.column, 8 );
						assert.equal( loc.name, 'log' );
					});
				});
			});
		});

		it( 'overwrites existing file', function () {
			return sander.copydir( 'samples/1/tmp' ).to( '.tmp/overwrite-file' ).then( function () {
				return sorcery.load( '.tmp/overwrite-file/helloworld.min.js' ).then( function ( chain ) {
					return chain.write().then( function () {
						return sander.readFile( '.tmp/overwrite-file/helloworld.min.js.map' ).then( String ).then( JSON.parse ).then( function ( map ) {
							var smc = new SourceMapConsumer( map );

							assert.equal( map.version, 3 );
							assert.deepEqual( map.file, 'helloworld.min.js' );
							assert.deepEqual( map.sources, [ 'helloworld.coffee' ]);
							assert.deepEqual( map.sourcesContent, [ sander.readFileSync( 'samples/1/src/helloworld.coffee' ).toString() ]);

							var loc = smc.originalPositionFor({ line: 1, column: 31 });
							assert.equal( loc.source, 'helloworld.coffee' );
							assert.equal( loc.line, 2 );
							assert.equal( loc.column, 8 );
							assert.equal( loc.name, 'log' );
						});
					});
				});
			});
		});

		it( 'allows sourceMappingURL to be an absolute path', function () {
			return sorcery.load( 'samples/1/tmp/helloworld.min.js' ).then( function ( chain ) {
				return chain.write( '.tmp/helloworld.min.js', {
					absolutePath: true
				}).then( function () {
					return sander.readFile( '.tmp/helloworld.min.js' ).then( String ).then( function ( generated ) {
						var mappingURL = /sourceMappingURL=([^\s]+)/.exec( generated )[1];
						assert.equal( mappingURL, encodeURI( path.resolve( '.tmp/helloworld.min.js.map' ) ) );
					});
				});
			});
		});

		it( 'adds a trailing newline after sourceMappingURL comment (#4)', function () {
			return sorcery.load( 'samples/1/tmp/helloworld.min.js' ).then( function ( chain ) {
				return chain.write( '.tmp/write-file/helloworld.min.js' ).then( function () {
					return sander.readFile( '.tmp/write-file/helloworld.min.js' ).then( String ).then( function ( file ) {
						var lines = file.split( '\n' );

						// sourceMappingURL comment should be on penultimate line
						assert.ok( /sourceMappingURL/.test( lines[ lines.length - 2 ] ) );

						// last line should be empty
						assert.equal( lines[ lines.length - 1 ], '' );
					});
				});
			});
		});

		it( 'ensures sourceMappingURL is encoded (#6)', function () {
			return sorcery.load( 'samples/4/tmp/file with spaces.esperanto.js' ).then( function ( chain ) {
				chain.write( '.tmp/with-spaces/file with spaces.js' ).then( function () {
					return sander.readFile( '.tmp/with-spaces/file with spaces.js' )
						.then( String )
						.then( function ( result ) {
							var sourceMappingURL = /sourceMappingURL=([^\r\n]+)/.exec( result )[0];
							assert.equal( sourceMappingURL, 'file%20with%20spaces.js.map' );
						});
				});
			});
		});

		it( 'allows the base to be specified as something other than the destination file', function () {
			return sorcery.load( 'samples/1/tmp/helloworld.min.js' ).then( function ( chain ) {
				return chain.write( '.tmp/write-file/helloworld.min.js', {
					base: 'x/y/z'
				}).then( function () {
					return sander.readFile( '.tmp/write-file/helloworld.min.js.map' )
						.then( String )
						.then( JSON.parse )
						.then( function ( map ) {
							assert.deepEqual( map.sources, [ '../../../samples/1/tmp/helloworld.coffee' ] );
						});
				});
			});
		});

		it( 'writes a block comment to CSS files', function () {
			return sorcery.load( 'samples/5/tmp/styles.css' ).then( function ( chain ) {
				return chain.write( '.tmp/write-file/styles.css' ).then( function () {
					return sander.readFile( '.tmp/write-file/styles.css' )
						.then( String )
						.then( function ( css ) {
							assert.ok( ~css.indexOf( '/*# sourceMappingURL=styles.css.map */' ) );
						});
				});
			});
		});

		it( 'decodes/encodes URIs', function () {
			return sorcery.load( 'samples/6/file with spaces.js' ).then( function ( chain ) {
				return chain.write( '.tmp/write-file/file with spaces.js' ).then( function () {
					return sander.readFile( '.tmp/write-file/file with spaces.js' )
						.then( String )
						.then( function ( js ) {
							assert.ok( ~js.indexOf( '//# sourceMappingURL=file%20with%20spaces.js.map' ) );
						});
				});
			});
		});

		it( 'handles sources with URL patterns differently from file paths (#9)', function () {
			return sorcery.load( 'samples/9/urlSource.js' ).then( function ( chain ) {
				return chain.write( '.tmp/write-file/urlSource.js' ).then( function () {
					return sander.readFile( '.tmp/write-file/urlSource.js.map' )
						.then( String )
						.then( function ( js ) {
							// sources that have "://" in them are not normalized the way filespecs are
							// and should appear in the target .map file exactly as they appeared in the
							// source .map file
							assert.ok( ~js.indexOf( "webpack:///./src/bar.js" ) );
						});
				});
			});
		});
	});

	describe( 'sorcery (sync)', function () {
		describe( 'chain.trace()', function () {
			it( 'follows a mapping back to its origin', function () {
				var chain, actual, expected;

				chain = sorcery.loadSync( 'samples/1/tmp/helloworld.min.js' );

				actual = chain.trace( 1, 31 );

				expected = {
					source: path.resolve( 'samples/1/tmp/helloworld.coffee' ),
					line: 2,
					column: 8,
					name: 'log'
				};

				assert.deepEqual( actual, expected );
			});
		});

		describe( 'chain.apply()', function () {
			it( 'includes sourcesContent', function () {
				var chain = sorcery.loadSync( 'samples/1/tmp/helloworld.min.js' );

				var map, smc;

				map = chain.apply();
				smc = new SourceMapConsumer( map );

				assert.equal( map.version, 3 );
				assert.deepEqual( map.file, 'helloworld.min.js' );
				assert.deepEqual( map.sources, [ 'helloworld.coffee' ]);
				assert.deepEqual( map.sourcesContent, [ sander.readFileSync( 'samples/1/src/helloworld.coffee' ).toString() ]);

				var loc = smc.originalPositionFor({ line: 1, column: 31 });
				assert.equal( loc.source, 'helloworld.coffee' );
				assert.equal( loc.line, 2 );
				assert.equal( loc.column, 8 );
				assert.equal( loc.name, 'log' );
			});

			it( 'includes user-specified content', function () {
				var javascript = '(function() {\
var answer;\
\
answer = 40 + 2;\
\
console.log("the answer is " + answer);\
\
}).call(this);';

				var coffeescript = 'answer = 40 + 2\
console.log "the answer is #{answer}"';

				var chain = sorcery.loadSync( 'example.js', {
					content: {
						'example.js': javascript,
						'example.coffee': coffeescript
					},
					sourcemaps: {
						'example.js': {
							version: 3,
							sources:[ 'example.coffee' ],
							sourcesContent: [ null ],
							names: [],
							mappings: 'AAAA;AAAA,MAAA,MAAA;;AAAA,EAAA,MAAA,GAAS,EAAA,GAAK,CAAd,CAAA;;AAAA,EACA,OAAO,CAAC,GAAR,CAAa,gBAAA,GAAe,MAA5B,CADA,CAAA;AAAA'
						}
					}
				});

				var map = chain.apply();

				assert.deepEqual( map.sourcesContent, [ coffeescript ] );
			});
		});

		describe( 'chain.writeSync()', function () {
			it( 'writes a file and accompanying sourcemap', function () {
				var chain = sorcery.loadSync( 'samples/1/tmp/helloworld.min.js' );

				chain.writeSync( '.tmp/write-file/helloworld.min.js' );

				return sorcery.load( '.tmp/write-file/helloworld.min.js' ).then( function ( chain ) {
					var map, smc;

					map = chain.apply();
					smc = new SourceMapConsumer( map );

					assert.equal( map.version, 3 );
					assert.deepEqual( map.file, 'helloworld.min.js' );
					assert.deepEqual( map.sources, [ '../../samples/1/tmp/helloworld.coffee' ]);
					assert.deepEqual( map.sourcesContent, [ sander.readFileSync( __dirname, 'samples/1/tmp/helloworld.coffee' ).toString() ]);

					var loc = smc.originalPositionFor({ line: 1, column: 31 });
					assert.equal( loc.source, '../../samples/1/tmp/helloworld.coffee' );
					assert.equal( loc.line, 2 );
					assert.equal( loc.column, 8 );
					assert.equal( loc.name, 'log' );
				});
			});
		});
	});
});
