var gulp    = require('gulp'),
webserver   = require('gulp-webserver');

gulp.task('server', function() {
  gulp.src('game')
    .pipe(webserver({
      livereload: false,
      directoryListing: false,
      open: true
    }));
});
