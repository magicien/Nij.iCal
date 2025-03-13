function updateFilter(event) {
    var searchString = event.currentTarget.value.toLowerCase();
    var elements = document.getElementsByClassName('liver-item');
    var livers = Array.from(elements);
    livers.forEach(function(liver) {
        if (searchString == '' || liver.getAttribute('tags').includes(searchString)) {
            liver.style.display = 'table-row';
        } else {
            liver.style.display = 'none';
        }
    });
}

window.addEventListener('load', function() {
    var input = document.getElementById('liver-filter-input');
    input.addEventListener('input', updateFilter);
});
